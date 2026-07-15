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

if [[ -d "$root/backend" ]]; then
  tar -czf "$root/backups/backend-before-$stamp.tar.gz" -C "$root" backend
fi

mkdir -p "$stage"
command cp -af "$source_root/backend/." "$stage/"
if [[ -f "$root/backend/.env" ]]; then
  command cp -f "$root/backend/.env" "$stage/.env"
fi

echo "[1/3] 构建新后端镜像"
COMPOSE_PROJECT_NAME=backend docker compose -f "$stage/compose.yaml" build api

echo "[2/3] 切换后端文件并重建 API"
if [[ -d "$root/backend" ]]; then
  mv "$root/backend" "$root/backups/backend-dir-$stamp"
fi
mv "$stage" "$root/backend"
COMPOSE_PROJECT_NAME=backend docker compose -f "$root/backend/compose.yaml" up -d --no-build --force-recreate api

echo "[3/3] 等待健康检查"
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:8787/health >/dev/null; then
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

curl -fsS "http://127.0.0.1:8787/platform-submissions?clientId=deploy-check" >/dev/null
docker compose -f "$root/backend/compose.yaml" ps
echo "icpc-trainer 后端已更新到 $ref；数据库与模型卷保持不变。"
