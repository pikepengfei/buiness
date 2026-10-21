#!/usr/bin/env bash
# =============================================================================
# PostgreSQL + z-buiness 库「完整可用性」自检脚本
# 检查链路：安装 → 服务 → 数据库 → 表结构 → 种子数据 → 管理员账号
# 用法:
#   ./pg-check.sh
#   PG_PREFIX=/usr/local/postgres16 PG_PASSWORD=xxx ./pg-check.sh
# 退出码: 全部通过=0，存在失败=1
# =============================================================================
set -u

PREFIX="${PG_PREFIX:-/usr/local/postgres16}"
PORT="${PG_PORT:-5432}"
DB="${PG_DB:-centremix}"
USER="${PG_USER:-postgres}"
PASS="${PG_PASSWORD:-CentremixDev2026}"

# schema.sql 中定义的 19 张表（顺序无关，仅用于存在性校验）
EXPECTED_TABLES=(roles users user_sessions login_logs site_settings menus
  pages article_categories articles product_categories products banners
  faqs media inquiries cooperation subscriptions contact_messages audit_logs)

pass=0; fail=0
ok(){ echo "  [OK]   $1"; pass=$((pass+1)); }
bad(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

echo "=== 1) 安装检查 ==="
if [ -x "$PREFIX/bin/postgres" ] && [ -x "$PREFIX/bin/pg_ctl" ] && [ -x "$PREFIX/bin/psql" ]; then
  ok "二进制存在于 $PREFIX/bin ($("$PREFIX/bin/postgres" --version 2>/dev/null | tr -d '\n'))"
else
  bad "二进制缺失，请先安装 PostgreSQL 到 $PREFIX"
fi

echo "=== 2) 服务检查 (端口 $PORT) ==="
if "$PREFIX/bin/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  ok "服务在线 (pg_isready)"
else
  bad "服务未监听 $PORT（先执行: ./pg-local.sh start）"
fi

export PGPASSWORD="$PASS"
PSQL="$PREFIX/bin/psql -h 127.0.0.1 -p $PORT -U $USER"

echo "=== 3) 数据库检查 ($DB) ==="
if $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" 2>/dev/null | grep -q 1; then
  ok "数据库 $DB 存在"
else
  bad "数据库 $DB 不存在（请建库并执行 schema.sql）"
fi

echo "=== 4) 表结构检查 (期望 ${#EXPECTED_TABLES[@]} 张) ==="
missing=""
for t in "${EXPECTED_TABLES[@]}"; do
  if ! $PSQL -d "$DB" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t'" 2>/dev/null | grep -q 1; then
    missing="$missing $t"
  fi
done
if [ -z "$missing" ]; then
  ok "全部 ${#EXPECTED_TABLES[@]} 张表存在"
else
  bad "缺失表:$missing"
fi

echo "=== 5) 种子数据检查 ==="
roles=$($PSQL -d "$DB" -tAc "SELECT count(*) FROM roles" 2>/dev/null | tr -d '[:space:]')
[ "$roles" = "3" ] && ok "roles = 3" || bad "roles = $roles (期望 3)"
ss=$($PSQL -d "$DB" -tAc "SELECT count(*) FROM site_settings" 2>/dev/null | tr -d '[:space:]')
[ "$ss" = "12" ] && ok "site_settings = 12" || bad "site_settings = $ss (期望 12)"
mn=$($PSQL -d "$DB" -tAc "SELECT count(*) FROM menus" 2>/dev/null | tr -d '[:space:]')
[ "$mn" = "5" ] && ok "menus = 5" || bad "menus = $mn (期望 5)"

echo "=== 6) 管理员账号检查 ==="
admin=$($PSQL -d "$DB" -tAc "SELECT username FROM users WHERE username='admin' AND status=1" 2>/dev/null | tr -d '[:space:]')
[ "$admin" = "admin" ] && ok "管理员 admin 存在且启用" || bad "管理员 admin 未就绪"
bc=$($PSQL -d "$DB" -tAc "SELECT (crypt('Admin@123456', password_hash)=password_hash) FROM users WHERE username='admin'" 2>/dev/null | tr -d '[:space:]')
[ "$bc" = "t" ] && ok "管理员密码有效 (bcrypt 可校验)" || bad "管理员密码校验失败"

echo "============================================"
echo "检查结果: 通过 $pass 项 / 失败 $fail 项"
if [ "$fail" -eq 0 ]; then
  echo "✅ PostgreSQL 及 z-buiness 库结构【完整可用】"
  exit 0
else
  echo "❌ 存在 $fail 项未通过，请按上方 [FAIL] 逐项修复"
  exit 1
fi
