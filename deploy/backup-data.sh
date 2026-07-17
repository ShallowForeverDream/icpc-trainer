#!/usr/bin/env bash
set -Eeuo pipefail

root="${ICPC_TRAINER_ROOT:-/opt/icpc-trainer}"
container="${ICPC_TRAINER_API_CONTAINER:-icpc-trainer-api}"
backup_dir="$root/backups/data"
stamp="$(date +%Y%m%d-%H%M%S)"
lock_dir="$root/.backup-lock"
container_tmp="/data/.icpc-trainer-backup-$stamp.sqlite"
host_tmp="$backup_dir/.icpc-trainer-backup-$stamp.sqlite"
final="$backup_dir/icpc-trainer-$stamp.sqlite.gz"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 执行数据备份。" >&2
  exit 1
fi
if [[ "$root" != "/opt/icpc-trainer" ]]; then
  echo "拒绝备份非预期目录：$root" >&2
  exit 1
fi

mkdir -p "$backup_dir"
chmod 700 "$root/backups" "$backup_dir"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "已有 icpc-trainer 数据备份正在运行，本次跳过。"
  exit 0
fi

cleanup() {
  rm -f -- "$host_tmp" "$final.tmp"
  docker exec "$container" rm -f -- "$container_tmp" >/dev/null 2>&1 || true
  rmdir "$lock_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]]; then
  echo "API 容器未运行，无法创建一致性数据库备份。" >&2
  exit 1
fi

docker exec -i \
  -e BACKUP_SOURCE="/data/icpc-trainer.sqlite" \
  -e BACKUP_TARGET="$container_tmp" \
  "$container" node - <<'NODE'
const { unlinkSync } = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const source = process.env.BACKUP_SOURCE;
const target = process.env.BACKUP_TARGET;
if (source !== "/data/icpc-trainer.sqlite" || !/^\/data\/\.icpc-trainer-backup-[0-9-]+\.sqlite$/.test(target)) throw new Error("backup path rejected");
try { unlinkSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
const db = new DatabaseSync(source);
const quote = String.fromCharCode(39);
db.exec(`VACUUM INTO ${quote}${target.replaceAll(quote, quote + quote)}${quote}`);
db.close();
NODE

docker cp "$container:$container_tmp" "$host_tmp" >/dev/null
gzip -9 -c "$host_tmp" > "$final.tmp"
gzip -t "$final.tmp"
mv -f -- "$final.tmp" "$final"
chmod 600 "$final"

find "$backup_dir" -maxdepth 1 -type f -name 'icpc-trainer-*.sqlite.gz' -mtime +13 -delete
echo "数据备份完成：$final ($(du -h "$final" | cut -f1))"
