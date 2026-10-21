#!/usr/bin/env bash
# =============================================================================
# z-buiness 本地开发一键启动脚本
#   1) PostgreSQL 服务   2) 后端 Node 服务 (backend)   3) 前端 Vue 项目 (buinessweb)
#
# 用法:
#   ./scripts/dev.sh [start]    # 依次启动 PG -> 后端 -> 前端（默认）
#   ./scripts/dev.sh stop       # 停止后端、前端；若 PG 是本次启动的则一并停止
#   ./scripts/dev.sh restart    # stop 后 start
#   ./scripts/dev.sh status     # 查看三个服务运行状态
#   ./scripts/dev.sh logs       # 实时跟踪后端 + 前端日志 (Ctrl+C 退出跟踪)
#
# 可覆盖: PG_PORT=5432 API_PORT=3000 WEB_PORT=5190 PG_PREFIX=/usr/local/postgres16
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
WEB_DIR="$ROOT_DIR/buinessweb"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"

PG_PREFIX="${PG_PREFIX:-/usr/local/postgres16}"
PG_DATA="${PG_DATA:-$PG_PREFIX/data}"
PG_PORT="${PG_PORT:-5432}"
API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-5190}"

mkdir -p "$LOG_DIR"

C_RESET='\033[0m'; C_GREEN='\033[32m'; C_RED='\033[31m'; C_YELLOW='\033[33m'; C_BLUE='\033[36m'
info() { printf "${C_BLUE}[INFO]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ OK ]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[WARN]${C_RESET} %s\n" "$*"; }
fail() { printf "${C_RED}[FAIL]${C_RESET} %s\n" "$*"; exit 1; }

# ---------------------------------------------------------------- node 环境
load_node() {
  command -v node >/dev/null 2>&1 && return 0
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
    if [ -f "$ROOT_DIR/.nvmrc" ]; then
      nvm use >/dev/null 2>&1 || nvm use "$(cat "$ROOT_DIR/.nvmrc")" >/dev/null 2>&1 || true
    fi
  fi
  command -v node >/dev/null 2>&1
}

# ---------------------------------------------------------------- 端口/进程
pid_on_port() { lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | head -1; }

alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }

read_pid() { [ -f "$RUN_DIR/$1.pid" ] && tr -d '[:space:]' < "$RUN_DIR/$1.pid"; }

# kill 进程组（npm/pnpm/vite 会派生子进程，只杀父进程会留下孤儿）
kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child" "$sig"; done
  kill "-$sig" "$pid" 2>/dev/null
}

stop_service() {
  local name="$1" port="$2" pid
  pid="$(read_pid "$name")"
  if alive "$pid"; then
    info "停止 $name (pid $pid)"
    kill_tree "$pid"
    for _ in 1 2 3 4 5 6 7 8 9 10; do alive "$pid" || break; sleep 0.5; done
    alive "$pid" && kill_tree "$pid" KILL
  fi
  rm -f "$RUN_DIR/$name.pid"
  pid="$(pid_on_port "$port")"
  if [ -n "$pid" ]; then
    warn "$name 端口 $port 仍被 pid $pid 占用（非本脚本启动，未处理）"
  fi
  ok "$name 已停止"
}

# ---------------------------------------------------------------- 1. PostgreSQL
start_postgres() {
  info "[1/3] 启动 PostgreSQL"
  # pg_isready 可能不在 PATH 中，优先使用 PG_PREFIX 下的自带版本
  command -v pg_isready >/dev/null 2>&1 || PATH="$PG_PREFIX/bin:$PATH"
  if pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
    ok "PostgreSQL 已在运行 (127.0.0.1:$PG_PORT)，复用现有实例"
    return 0
  fi
  [ -x "$PG_PREFIX/bin/pg_ctl" ] || fail "未找到 $PG_PREFIX/bin/pg_ctl，请确认安装路径或用 PG_PREFIX=... 覆盖"
  [ -d "$PG_DATA" ] || fail "未找到数据目录 $PG_DATA"
  # 端口被其它进程占用时提前报错，避免 pg_ctl 失败原因难读
  local occupant; occupant="$(pid_on_port "$PG_PORT")"
  [ -n "$occupant" ] && fail "端口 $PG_PORT 已被 pid $occupant 占用，请先释放或改用 PG_PORT=5433"
  "$PG_PREFIX/bin/pg_ctl" -D "$PG_DATA" -l "$LOG_DIR/postgres.log" \
    -o "-p $PG_PORT -k $PG_DATA -c listen_addresses='localhost'" -w start >/dev/null \
    || fail "PostgreSQL 启动失败，详见 $LOG_DIR/postgres.log"
  pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1 \
    || fail "PostgreSQL 启动后无响应，详见 $LOG_DIR/postgres.log"
  echo "$PG_PORT" > "$RUN_DIR/postgres.port"
  ok "PostgreSQL 已启动 (127.0.0.1:$PG_PORT)"
}

stop_postgres() {
  if pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
    warn "PostgreSQL 不作为 stop 目标：本脚本只在需要时启动它，且由 pg_ctl 以守护进程方式管理。"
    warn "如需停止请执行: $BACKEND_DIR/scripts/pg-local.sh stop"
  fi
}

# ---------------------------------------------------------------- 2. 后端
start_backend() {
  info "[2/3] 启动后端 Node 服务 (backend)"
  local pid; pid="$(pid_on_port "$API_PORT")"
  if [ -n "$pid" ]; then
    ok "端口 $API_PORT 已有监听 (pid $pid)，跳过后端启动"
    return 0
  fi
  [ -f "$BACKEND_DIR/.env" ] || fail "缺少 $BACKEND_DIR/.env（可从 .env.example 复制）"
  if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    info "首次运行：安装后端依赖 (npm install)"
    ( cd "$BACKEND_DIR" && npm install ) || fail "后端依赖安装失败"
  fi
  ( cd "$BACKEND_DIR" && nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 & echo $! > "$RUN_DIR/backend.pid" )
  info "等待后端就绪 http://localhost:$API_PORT ..."
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && { ok "后端已就绪"; return 0; }
    alive "$(read_pid backend)" || { tail -20 "$LOG_DIR/backend.log"; fail "后端进程已退出"; }
    sleep 1
  done
  warn "后端 30s 内未响应 /health（可能仍在编译），请检查 $LOG_DIR/backend.log"
}

# ---------------------------------------------------------------- 3. 前端
start_web() {
  info "[3/3] 启动前端 Vue 项目 (buinessweb)"
  local pid; pid="$(pid_on_port "$WEB_PORT")"
  if [ -n "$pid" ]; then
    ok "端口 $WEB_PORT 已有监听 (pid $pid)，跳过前端启动"
    return 0
  fi
  if [ ! -d "$WEB_DIR/node_modules" ]; then
    info "首次运行：安装前端依赖 (pnpm install)"
    ( cd "$WEB_DIR" && pnpm install ) || fail "前端依赖安装失败"
  fi
  ( cd "$WEB_DIR" && nohup pnpm dev > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$RUN_DIR/frontend.pid" )
  info "等待前端就绪 http://localhost:$WEB_PORT ..."
  for _ in $(seq 1 40); do
    curl -fsS "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1 && { ok "前端已就绪"; return 0; }
    alive "$(read_pid frontend)" || { tail -20 "$LOG_DIR/frontend.log"; fail "前端进程已退出"; }
    sleep 1
  done
  warn "前端 40s 内未响应，请检查 $LOG_DIR/frontend.log"
}

# ---------------------------------------------------------------- 状态
service_state() {
  local name="$1" port="$2" pid ppid
  if [ "$name" = "postgres" ]; then
    command -v pg_isready >/dev/null 2>&1 || PATH="$PG_PREFIX/bin:$PATH"
    if pg_isready -h 127.0.0.1 -p "$port" >/dev/null 2>&1; then
      printf "${C_GREEN}运行中${C_RESET}  :%s (接受连接)\n" "$port"
    else
      printf "${C_RED}已停止${C_RESET}  :%s\n" "$port"
    fi
    return 0
  fi
  ppid="$(read_pid "$name")"
  pid="$(pid_on_port "$port")"
  if [ -n "$pid" ]; then
    if [ -n "$ppid" ] && alive "$ppid"; then printf "${C_GREEN}运行中${C_RESET}  :%s (pid %s)\n" "$port" "$pid"
    else printf "${C_GREEN}运行中${C_RESET}  :%s (pid %s, 非本脚本启动)\n" "$port" "$pid"; fi
  elif alive "$ppid"; then printf "${C_YELLOW}启动中${C_RESET}  :%s (pid %s 尚未监听)\n" "$port" "$ppid"
  else printf "${C_RED}已停止${C_RESET}  :%s\n" "$port"; fi
}

cmd_status() {
  printf 'PostgreSQL :'; service_state postgres "$PG_PORT"
  printf '后端 API   :'; service_state backend "$API_PORT"
  printf '前端 Web   :'; service_state frontend "$WEB_PORT"
}

cmd_start() {
  load_node || fail "未找到 node，请安装 Node.js 或配置 nvm"
  info "Node $(node -v)  工作目录 $ROOT_DIR"
  start_postgres
  start_backend
  start_web
  echo
  cmd_status
  echo
  ok "全部启动完成"
  info "前端 http://localhost:$WEB_PORT    后端 http://localhost:$API_PORT    数据库 127.0.0.1:$PG_PORT/centremix"
  info "日志: $LOG_DIR/{postgres,backend,frontend}.log    跟踪: $0 logs    停止: $0 stop"
}

cmd_stop() {
  stop_service frontend "$WEB_PORT"
  stop_service backend "$API_PORT"
  stop_postgres
}

cmd_logs() {
  info "跟踪日志，Ctrl+C 退出（不影响服务）"
  tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" 2>/dev/null
}

case "${1:-start}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; sleep 1; cmd_start ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *) printf '用法: %s {start|stop|restart|status|logs}\n' "$0"; exit 1 ;;
esac
