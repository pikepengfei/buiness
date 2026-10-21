#!/usr/bin/env bash
# =============================================================================
# 本地 PostgreSQL 管理脚本 (EDB PostgreSQL 16.15, 用户级安装 ~/postgres16)
# 用法:
#   ./pg-local.sh start      # 启动本地 PostgreSQL (端口 5432)
#   ./pg-local.sh stop       # 停止
#   ./pg-local.sh restart    # 重启
#   ./pg-local.sh status     # 查看运行状态
# =============================================================================
set -e

PREFIX="/usr/local/postgres16"
PGDATA="$PREFIX/data"
PORT=5432

case "$1" in
  start)
    echo "启动 PostgreSQL @ port $PORT (data: $PGDATA)"
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" -l "$PGDATA/logfile" \
      -o "-p $PORT -k $PGDATA -c listen_addresses='localhost'" -w start
    ;;
  stop)
    echo "停止 PostgreSQL"
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" stop -m fast
    ;;
  restart)
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" stop -m fast || true
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" -l "$PGDATA/logfile" \
      -o "-p $PORT -k $PGDATA -c listen_addresses='localhost'" -w start
    ;;
  status)
    "$PREFIX/bin/pg_ctl" -D "$PGDATA" status || true
    "$PREFIX/bin/pg_isready" -h 127.0.0.1 -p "$PORT"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
