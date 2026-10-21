#!/usr/bin/env bash
# =============================================================================
# 将本地 PostgreSQL 从 ~/postgres16 迁移到 /usr/local/postgres16
#
# 用法（在「有 sudo 权限」的真实 Mac 终端，以普通用户执行）:
#   bash migrate-postgres-to-usr-local.sh
#   MIGRATE_FORCE=1 bash migrate-postgres-to-usr-local.sh   # 非交互/跳过确认
#
# 说明:
#   - /usr/local 是 root 所有的系统目录（macOS 上通常如此），移动与改属主需要 sudo。
#   - PostgreSQL 不能以 root 运行，因此数据目录最终属主会改回当前用户。
#   - 脚本内部仅对「需要权限」的步骤调用 sudo，启动服务仍以当前用户进行。
# =============================================================================
set -e

ME="$(id -un)"
OLD_PREFIX="$HOME/postgres16"
NEW_PREFIX="/usr/local/postgres16"
OLD_PGDATA="$OLD_PREFIX/data"

echo "== 当前用户: $ME =="
echo "== 旧路径: $OLD_PREFIX =="
echo "== 新路径: $NEW_PREFIX =="

# 前置检查
if [ ! -d "$OLD_PREFIX" ]; then
  echo "错误: 旧安装目录不存在: $OLD_PREFIX" >&2
  exit 1
fi
if [ -e "$NEW_PREFIX" ]; then
  echo "错误: 目标已存在: $NEW_PREFIX（请先清理或改脚本中的 NEW_PREFIX）" >&2
  exit 1
fi
if ! command -v sudo >/dev/null 2>&1; then
  echo "错误: 当前环境没有 sudo，无法写入 /usr/local" >&2
  exit 1
fi

# 交互确认
if [ -t 0 ] && [ -z "${MIGRATE_FORCE:-}" ]; then
  read -r -p "确认将 PostgreSQL 迁移到 $NEW_PREFIX ? [y/N] " ans
  case "$ans" in y|Y) ;; *) echo "已取消"; exit 0 ;; esac
fi

# 1) 停止旧实例（当前用户，旧路径）
if [ -x "$OLD_PREFIX/bin/pg_ctl" ]; then
  echo "== 停止旧 PostgreSQL 实例 =="
  "$OLD_PREFIX/bin/pg_ctl" -D "$OLD_PGDATA" stop -m fast || true
  sleep 2
fi

# 2) 需要权限：创建目标目录、移动、修正属主
echo "== [sudo] 移动安装目录 =="
sudo mkdir -p /usr/local
sudo mv "$OLD_PREFIX" "$NEW_PREFIX"

echo "== [sudo] 修正属主为 $ME (PostgreSQL 不能以 root 运行) =="
sudo chown -R "$ME":staff "$NEW_PREFIX"
# 数据目录权限必须严格（postgres 要求 0700）
chmod 700 "$NEW_PREFIX/data"

# 3) 更新同目录下的 pg-local.sh 中的 PREFIX
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGLOCAL="$SCRIPT_DIR/pg-local.sh"
if [ -f "$PGLOCAL" ]; then
  echo "== 更新 $PGLOCAL 中的 PREFIX =="
  sed -i '' "s#^PREFIX=.*#PREFIX=\"$NEW_PREFIX\"#" "$PGLOCAL"
fi
# 备注: backend/.env 仅含 host/port/user/password，不含安装路径，无需改动。

# 4) 以当前用户启动新实例
echo "== 启动迁移后的 PostgreSQL =="
"$NEW_PREFIX/bin/pg_ctl" -D "$NEW_PREFIX/data" -l "$NEW_PREFIX/data/logfile" \
  -o "-p 5432 -k $NEW_PREFIX/data -c listen_addresses='localhost'" -w start

# 5) 验证
"$NEW_PREFIX/bin/pg_isready" -h 127.0.0.1 -p 5432
"$NEW_PREFIX/bin/psql" -h 127.0.0.1 -p 5432 -U postgres -d centremix -tAc \
  "SELECT 'OK db='||current_database()||' tables='||count(*) FROM information_schema.tables WHERE table_schema='public';"

echo "== 迁移完成。新安装路径: $NEW_PREFIX =="
echo "== 之后用: ./pg-local.sh {start|stop|status} 管理 =="
