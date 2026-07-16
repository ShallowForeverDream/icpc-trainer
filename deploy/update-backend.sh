#!/usr/bin/env bash
set -Eeuo pipefail

repo="ShallowForeverDream/icpc-trainer"
ref="${1:-main}"
root="${ICPC_TRAINER_ROOT:-/opt/icpc-trainer}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 执行此更新脚本。" >&2
  exit 1
fi
if [[ "$root" != "/opt/icpc-trainer" ]]; then
  echo "拒绝更新非预期目录：$root" >&2
  exit 1
fi

stamp="$(date +%Y%m%d-%H%M%S)"
tmp="$(mktemp -d /tmp/icpc-trainer-update.XXXXXX)"
stage="$root/.backend-stage-$stamp"
image_tag="$(printf '%s' "$ref" | tr -cs 'A-Za-z0-9_.-' '-')"
image_tag="${image_tag#-}"
image_tag="${image_tag%-}"
export ICPC_TRAINER_IMAGE_TAG="${image_tag:-release}"
export ICPC_TRAINER_SOURCE_REF="$ref"
cleanup() {
  rm -rf -- "$tmp"
  [[ ! -d "$stage" ]] || rm -rf -- "$stage"
}
trap cleanup EXIT

mkdir -p "$root/backups"
curl -fsSL --retry 4 --retry-delay 2 \
  "https://github.com/$repo/archive/$ref.tar.gz" \
  -o "$tmp/source.tar.gz"
tar -xzf "$tmp/source.tar.gz" -C "$tmp"
source_root="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'icpc-trainer-*' -print -quit)"
if [[ -z "$source_root" || ! -f "$source_root/backend/compose.yaml" ]]; then
  echo "下载包中没有找到 backend/compose.yaml。" >&2
  exit 1
fi
expected_api="$(sed -nE 's/^[[:space:]]*api: ([0-9]+),?$/\1/p' "$source_root/backend/server.mjs" | head -n 1)"
if [[ -z "$expected_api" ]]; then
  echo "无法从后端源码读取 API 版本。" >&2
  exit 1
fi

mkdir -p "$root/deploy"
install -m 0700 "$source_root/deploy/backup-data.sh" "$root/deploy/backup-data.sh"
if [[ "$(docker inspect -f '{{.State.Running}}' icpc-trainer-api 2>/dev/null || true)" == "true" ]]; then
  echo "[1/5] 备份 SQLite 数据"
  "$root/deploy/backup-data.sh"
else
  echo "[1/5] 首次安装，跳过旧数据库备份"
fi
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  install -m 0644 "$source_root/deploy/icpc-trainer-backup.service" /etc/systemd/system/icpc-trainer-backup.service
  install -m 0644 "$source_root/deploy/icpc-trainer-backup.timer" /etc/systemd/system/icpc-trainer-backup.timer
  systemctl daemon-reload
  systemctl enable --now icpc-trainer-backup.timer >/dev/null
fi

if [[ -d "$root/backend" ]]; then
  tar -czf "$root/backups/backend-before-$stamp.tar.gz" -C "$root" backend
fi

mkdir -p "$stage"
command cp -af "$source_root/backend/." "$stage/"
if [[ -f "$root/backend/.env" ]]; then
  command cp -f "$root/backend/.env" "$stage/.env"
fi

echo "[2/5] 构建新后端镜像"
COMPOSE_PROJECT_NAME=backend docker compose -f "$stage/compose.yaml" build api

echo "[3/5] 切换后端文件并重建 API"
if [[ -d "$root/backend" ]]; then
  mv "$root/backend" "$root/backups/backend-dir-$stamp"
fi
mv "$stage" "$root/backend"
COMPOSE_PROJECT_NAME=backend docker compose -f "$root/backend/compose.yaml" up -d --no-build --force-recreate api

echo "[4/5] 等待本机健康检查"
healthy=0
health=""
for _ in $(seq 1 60); do
  if health="$(curl -fsS --max-time 3 http://127.0.0.1:8787/health)"; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  docker compose -f "$root/backend/compose.yaml" logs --tail=100 api >&2 || true
  echo "新 API 未通过健康检查；旧文件保存在 $root/backups/backend-dir-$stamp。" >&2
  exit 1
fi

if [[ "$health" != *"\"api\":$expected_api"* || "$health" != *"\"revision\":\"$ref\""* ]]; then
  docker compose -f "$root/backend/compose.yaml" logs --tail=100 api >&2 || true
  echo "健康检查通过，但运行版本与目标版本不一致：$health" >&2
  exit 1
fi

curl -fsS "http://127.0.0.1:8787/platform-submissions?clientId=deploy-check" >/dev/null
echo "[5/5] 验证公网 HTTPS 反向代理"
public_api="${ICPC_TRAINER_PUBLIC_API:-https://114.55.130.137/icpc-api}"
public_health=""
for _ in $(seq 1 30); do
  if public_health="$(curl -kfsS --max-time 5 -H 'Cache-Control: no-cache' "$public_api/health?revision=$ref")" \
    && [[ "$public_health" == *"\"api\":$expected_api"* ]] \
    && [[ "$public_health" == *"\"revision\":\"$ref\""* ]]; then
    break
  fi
  public_health=""
  sleep 2
done
if [[ -z "$public_health" ]]; then
  echo "本机 API 已升级，但公网 $public_api 尚未返回目标版本；请检查 Nginx 反向代理：$(curl -kfsS --max-time 5 "$public_api/health" 2>/dev/null || echo 'unreachable')" >&2
  exit 1
fi
docker compose -f "$root/backend/compose.yaml" ps
echo "icpc-trainer 后端已更新到 $ref；数据库与模型卷保持不变。"
