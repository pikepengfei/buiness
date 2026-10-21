# PostgreSQL 本地安装、配置与 z-buiness 官网数据库初始化执行文档

> 适用对象：`z-buiness` 企业官网项目（前端 `bigscreenweb` + 后端 `backend`，PostgreSQL 14+ 云端/本地数据库）
> 本文档记录**从环境准备 → PostgreSQL 安装配置 → 数据库创建 → 数据初始化**的完整、可直接执行的操作过程。
> 所有命令均已在本地 macOS（Intel x86_64，macOS 13.7）实测通过。

---

## 0. 成果速览（本机已完成状态）

| 项 | 值 |
|---|---|
| PostgreSQL 版本 | **16.15**（EDB 发行版） |
| 安装路径 | `/usr/local/postgres16`（已从 `~/postgres16` 迁移，目录属主为当前用户，免 sudo 启停） |
| 数据目录 | `/usr/local/postgres16/data` |
| 服务端口 | **5432**（localhost 监听） |
| 超级用户 | `postgres` / 密码 `CentremixDev2026` |
| 业务数据库 | `centremix`（19 张表已建） |
| 种子数据 | 角色 3 条、站点设置 12 条、导航菜单 5 条 |
| 管理员账号 | `admin` / `Admin@123456`（角色 `super_admin`，bcrypt 哈希，后端可正常登录） |
| 后端连接 | `backend/.env` 已生成，指向本地库 |
| 启停脚本 | `backend/scripts/pg-local.sh` |

---

## 1. 环境准备与前置检查

### 1.1 确认操作系统与用户
```bash
sw_vers                      # 确认 macOS 版本
whoami                      # 确认是普通用户（PostgreSQL 不能以 root 运行）
id -u                       # 非 0 即可（安装目录现为 /usr/local/postgres16，已 chown 给当前用户，免 sudo 启停）
```
> 若你使用 Homebrew 安装失败（如旧版 Homebrew 把 macOS 13 误判为 pre-release 而无对应 bottle），或网络无法访问 GitHub（本文档环境即如此），请直接采用第 2 节的 EDB 官方二进制方式。

### 1.2 端口与磁盘
```bash
# 确认 5432 未被占用（若被占用且非本项目实例，请改用 5433，并同步修改 .env）
pg_isready -h 127.0.0.1 -p 5432 2>/dev/null || echo "5432 空闲，可用"
df -h ~ | tail -1            # 确认剩余空间 > 1GB
```
> 本机初始化时曾检测到 5432 已被另一个 PostgreSQL 实例占用。如发生冲突，将下文所有 `-p 5432` 替换为 `-p 5433`，并在 `backend/.env` 的 `DATABASE_URL` 同步改成 `:5433/centremix`。

---

## 2. 安装 PostgreSQL（EDB 官方二进制，免 sudo、免 Homebrew）

> 选择理由：Homebrew 在本环境因旧版本 + 网络限制无法拉取 bottle；GitHub（含 Postgres.app）被代理拦截返回 502。EDB 官方二进制托管于 `get.enterprisedb.com`，本环境可直连，且支持**用户级解压安装**。

> **当前部署状态（2026-10-10 更新）**：PostgreSQL 已安装并运行于 **`/usr/local/postgres16`**（端口 5432），`centremix` 数据库、19 张表、种子数据与管理员账号均已就绪。
> 安装目录已从最初的 `~/postgres16` 迁移至 `/usr/local/postgres16`（通过随附脚本 `backend/scripts/migrate-postgres-to-usr-local.sh` 完成，迁移后目录 `chown` 给当前用户，仍可免 sudo 启停）。
> 下文命令块中的 `PREFIX` 均已统一为 `/usr/local/postgres16`。
> **安装/迁移/启停/验证是否完整可用，直接用 `backend/scripts/pg-check.sh` 一键自检**（详见第 9 节）。

### 2.1 下载 macOS 安装包（PG 16.15）
```bash
cd /tmp
curl -L --http1.1 -o postgresql-16.15-1-osx.dmg \
  https://get.enterprisedb.com/postgresql/postgresql-16.15-1-osx.dmg
# 校验：HTTP 200，文件约 348MB
ls -lh postgresql-16.15-1-osx.dmg
```

### 2.2 挂载并解压（extract-only，不注册系统服务）
```bash
hdiutil attach /tmp/postgresql-16.15-1-osx.dmg -nobrowse -quiet
INSTALLER="/Volumes/PostgreSQL 16.15-1/postgresql-16.15-1-osx.app/Contents/MacOS/installbuilder.sh"
rm -rf "/usr/local/postgres16"
"$INSTALLER" --mode unattended --unattendedmodeui none --extract-only 1 \
  --prefix "/usr/local/postgres16" \
  --enable-components server,commandlinetools \
  --disable-components pgAdmin,stackbuilder \
  --superaccount postgres --superpassword CentremixDev2026 --serverport 5432
hdiutil detach "/Volumes/PostgreSQL 16.15-1" 2>/dev/null || true
```
> ⚠️ **已知坑（必做）**：`extract-only` 在收尾创建 `lib/libcom_err.dylib` 等符号链接时，会因安装器的临时文件操作在某些受限环境下中断并误报失败；但**二进制已完整解压到 `/usr/local/postgres16/bin`**。只要执行 2.3 补全符号链接即可，无需重装。

### 2.3 补全动态库符号链接（关键修复）
PostgreSQL 的 `.dylib` 需要「无版本号」和「主版本号」两种软链。安装器未生成它们，会导致 `initdb` 报 `Library not loaded: @rpath/libicudata.68.dylib`。一次性补全：
```bash
cd "/usr/local/postgres16/lib"
for f in *.dylib; do
  case "$f" in
    lib*.dylib)
      name=$(echo "$f" | sed -E 's/^lib([^.]+)\..*/\1/')
      major=$(echo "$f" | sed -E 's/^lib[^.]*\.([0-9]+).*/\1/')
      [ ! -e "lib$name.dylib" ] && ln -sf "$f" "lib$name.dylib"
      [ -n "$major" ] && [ ! -e "lib$name.$major.dylib" ] && ln -sf "$f" "lib$name.$major.dylib"
      ;;
  esac
done
# 验证二进制可加载
"/usr/local/postgres16/bin/initdb" --version   # 应输出 PostgreSQL 16.15
"/usr/local/postgres16/bin/psql"   --version
```

---

## 3. 初始化数据库集群（initdb）

```bash
PREFIX="/usr/local/postgres16"
PGDATA="$PREFIX/data"
printf 'CentremixDev2026' > /tmp/pg_pw.txt && chmod 600 /tmp/pg_pw.txt

rm -rf "$PGDATA"   # 确保干净；重复初始化时执行
"$PREFIX/bin/initdb" -D "$PGDATA" -U postgres -E UTF8 --locale=C \
  -A scram-sha-256 --pwfile=/tmp/pg_pw.txt
```
输出 `Success. You can now start the database server using: ...` 即成功。
- 字符集 UTF8，排序规则 C（CMS 中文检索用 `to_tsvector('simple',...)`，不受 collation 影响，稳定可复现）。
- 时区自动识别为 `Asia/Shanghai`（本机）。

---

## 4. 启动服务

```bash
PREFIX="/usr/local/postgres16"
PGDATA="$PREFIX/data"
"$PREFIX/bin/pg_ctl" -D "$PGDATA" -l "$PGDATA/logfile" \
  -o "-p 5432 -k $PGDATA -c listen_addresses='localhost'" -w start
"$PREFIX/bin/pg_isready" -h 127.0.0.1 -p 5432   # 期望: accepting connections
```
> 推荐改用随附脚本（见第 8 节）：`./backend/scripts/pg-local.sh start|stop|restart|status`。

---

## 5. 创建业务数据库 `centremix`

```bash
export PGPASSWORD=CentremixDev2026
"/usr/local/postgres16/bin/createdb" -h 127.0.0.1 -p 5432 -U postgres centremix
"/usr/local/postgres16/bin/psql" -h 127.0.0.1 -p 5432 -U postgres -tAc \
  "SELECT datname FROM pg_database WHERE datname='centremix';"   # 应输出 centremix
```

---

## 6. 执行建表与种子数据（schema.sql）

表结构与初始数据定义见 `backend/sql/schema.sql`（19 张表 + 角色/站点设置/导航菜单种子）。

```bash
export PGPASSWORD=CentremixDev2026
SQL="$HOME/Desktop/展创振华科技/z-buiness/backend/sql/schema.sql"   # 请按实际路径调整
"/usr/local/postgres16/bin/psql" -h 127.0.0.1 -p 5432 -U postgres -d centremix \
  -v ON_ERROR_STOP=1 -f "$SQL"
```
预期输出包含：
```
CREATE TABLE ... (共 19 张)
INSERT 0 3     # roles: super_admin / editor / operator
INSERT 0 12    # site_settings（含 brand_color = #DE6420）
INSERT 0 5     # menus（首页/关于我们/产品中心/新闻咨询/售后服务）
```
> 关键的修复点（已写入 schema.sql）：`menus.url` 设为 `UNIQUE`，种子用 `ON CONFLICT (url) DO NOTHING`，保证可重复执行幂等。

---

## 7. 创建管理员账号

官方脚本 `npm run setup-admin` 需要先 `npm install`（依赖 `pg`、`bcrypt` 等）。在依赖未安装的受限环境，可直接用 SQL 通过 `pgcrypto` 生成标准 bcrypt 哈希（后端 `bcrypt.compare` 可正常校验 `$2a$`/`$2b$`）。

注意口径：后端只接收**口令的 SHA-256 摘要**，入库的是 `bcrypt(摘要)`，所以 SQL 里必须先 `digest(...,'sha256')` 再 `crypt(...)`，直接对明文做 bcrypt 的账号登录会报「用户名或密码错误」。

```bash
export PGPASSWORD=CentremixDev2026
"/usr/local/postgres16/bin/psql" -h 127.0.0.1 -p 5432 -U postgres -d centremix -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username='admin') THEN
    INSERT INTO users(username,email,password_hash,display_name,role_id,status)
    VALUES('admin','admin@centremix.com',
           crypt(encode(digest('Admin@123456','sha256'),'hex'), gen_salt('bf',12)),
           '超级管理员',
           (SELECT id FROM roles WHERE code='super_admin'), 1);
  END IF;
END $$;
SQL
```
- 账号：`admin`　密码：`Admin@123456`　角色：`super_admin`　状态：启用
- 后端依赖就绪后，仍可用 `ADMIN_PASSWORD=Admin@123456 npm run setup-admin` 重跑（脚本会检测到已存在而跳过，幂等）。

---

## 8. 后端连接配置（backend/.env）

已在 `backend/.env` 写入本地连接（节选）：
```
DATABASE_URL=postgres://postgres:CentremixDev2026@localhost:5432/centremix
STORAGE_DRIVER=local
STORAGE_PUBLIC_BASE=http://localhost:3000/uploads
STORAGE_LOCAL_DIR=./uploads
JWT_SECRET=<随机32字节十六进制>
JWT_REFRESH_SECRET=<随机32字节十六进制>
```
> 生产环境请将 `DATABASE_URL` 改为云端库（Supabase / 阿里云 RDS / 腾讯云 PostgreSQL），`STORAGE_DRIVER` 改回 `s3` 并填好访问密钥，并重新生成 JWT 密钥。

### 随附启停脚本
```bash
chmod +x backend/scripts/pg-local.sh
./backend/scripts/pg-local.sh start     # 启动
./backend/scripts/pg-local.sh status    # 查看状态
./backend/scripts/pg-local.sh stop      # 停止
```
（如需开机自启，可基于 `pg_ctl` 手写一个 `~/Library/LaunchAgents/com.centremix.postgres.plist`，本文不展开。）

---

## 9. 一键完整性自检脚本（pg-check.sh）

本仓库提供 `backend/scripts/pg-check.sh`，把「安装 → 服务 → 数据库 → 表结构 → 种子 → 管理员」6 个环节串成一次自动检查，**从 PostgreSQL 安装情况一路验证到数据库表结构完整可用**，全部通过则退出码 0。

### 9.1 用法
```bash
chmod +x backend/scripts/pg-check.sh

# 默认：安装路径 /usr/local/postgres16、端口 5432、库 centremix、用户 postgres、密码 CentremixDev2026
./backend/scripts/pg-check.sh

# 覆盖默认（例如换端口 / 换密码 / 换安装前缀）
PG_PREFIX=/usr/local/postgres16 PG_PASSWORD=CentremixDev2026 ./backend/scripts/pg-check.sh
```
> 可用环境变量：`PG_PREFIX`、`PG_PORT`、`PG_DB`、`PG_USER`、`PG_PASSWORD`。

### 9.2 检查项（6 阶段）
1. **安装检查**：`/usr/local/postgres16/bin` 下 `postgres`/`pg_ctl`/`psql` 是否存在且可执行，并输出版本。
2. **服务检查**：`pg_isready` 探测 127.0.0.1:5432 是否 `accepting connections`。
3. **数据库检查**：`pg_database` 中是否存在 `centremix`。
4. **表结构检查**：`schema.sql` 定义的 **19 张表**是否全部存在（roles/users/user_sessions/login_logs/site_settings/menus/pages/article_categories/articles/product_categories/products/banners/faqs/media/inquiries/cooperation/subscriptions/contact_messages/audit_logs）。
5. **种子数据检查**：`roles = 3`、`site_settings = 12`、`menus = 5`。
6. **管理员账号检查**：`admin` 用户存在且 `status=1`（启用），且 `crypt(encode(digest('Admin@123456','sha256'),'hex'), password_hash)=password_hash`（后端 bcrypt 可正常登录）。

### 9.3 预期输出（本机实测，全部通过）
```
=== 1) 安装检查 ===
  [OK]   二进制存在于 /usr/local/postgres16/bin (postgres (PostgreSQL) 16.15)
=== 2) 服务检查 (端口 5432) ===
  [OK]   服务在线 (pg_isready)
=== 3) 数据库检查 (centremix) ===
  [OK]   数据库 centremix 存在
=== 4) 表结构检查 (期望 19 张) ===
  [OK]   全部 19 张表存在
=== 5) 种子数据检查 ===
  [OK]   roles = 3
  [OK]   site_settings = 12
  [OK]   menus = 5
=== 6) 管理员账号检查 ===
  [OK]   管理员 admin 存在且启用
  [OK]   管理员密码有效 (bcrypt 可校验)
============================================
检查结果: 通过 9 项 / 失败 0 项
✅ PostgreSQL 及 z-buiness 库结构【完整可用】
```

### 9.4 退出码
- `0`：安装、服务、数据库、表结构、种子、管理员**全部就绪**，可直接启动后端。
- `1`：存在未通过项，按日志中 `[FAIL]` 提示逐项修复（缺库跑第 5–7 节，缺表跑第 6 节，服务未起跑第 4 节 / `pg-local.sh start`）。

---

## 10. 手动验证（SQL 直查，可选）

```bash
export PGPASSWORD=CentremixDev2026
"/usr/local/postgres16/bin/psql" -h 127.0.0.1 -p 5432 -U postgres -d centremix -tAc "
SELECT 'tables='||count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';
SELECT 'roles='||count(*) FROM roles;
SELECT 'site_settings='||count(*) FROM site_settings;
SELECT 'menus='||count(*) FROM menus;
SELECT 'admin='||username||' role='||(SELECT code FROM roles r WHERE r.id=u.role_id)||' status='||status FROM users u WHERE username='admin';
SELECT 'pw_ok='||(crypt(encode(digest('Admin@123456','sha256'),'hex'), password_hash)=password_hash) FROM users WHERE username='admin';
SELECT 'brand_color='||value FROM site_settings WHERE key='brand_color';
"
```
预期：`tables=19`、`roles=3`、`site_settings=12`、`menus=5`、`admin=admin role=super_admin status=1`、`pw_ok=true`、`brand_color=#DE6420`。

---

## 11. 常见问题（Troubleshooting）

1. **`initdb` 报 `Library not loaded: libicudata.68.dylib`**
   → 漏做 2.3 的符号链接补全。重新执行 2.3 即可。
2. **`createdb` 报 `could not rename file ... Operation not permitted`**
   → 发生在受沙箱限制、禁止数据目录内 rename 的运行环境。需在**关闭沙箱/获得完整文件权限**后重做第 3–7 节（本环境即如此，已在沙箱外完成初始化）。在普通开发机上不会出现。
3. **端口 5432 冲突**
   → 见 1.2，将 `-p 5432` 全部改为 `-p 5433`，并同步 `backend/.env` 与 `pg-local.sh` 的端口。
4. **`psql: password authentication failed`**
   → 确认使用 `CentremixDev2026`（非安装器 `--superpassword` 之外的密码；本流程最终以 `initdb` 的 pwfile 为准）。
5. **`npm install` 拉取 `@aws-sdk/client-s3` 等公共包报 403**
   → 私有 Verdaccio 镜像未代理公共包，需在能访问公共 npm 的机器（如构建机 84.92）安装后再拷 `node_modules`，或临时切换公共 npm registry。

---

## 附：一键复现脚本（高级）

如需在**干净环境**一键重建，可把第 2–7 节串联为脚本。注意第 3 节后的写操作在受限沙箱内需在「无沙箱」权限下执行。核心序列：

```bash
# 1) 安装 + 补链（见 2.x）
# 2) initdb + 启动 + 建库 + schema + 管理员（见 3–7）
# 3) 验证（见第 9 节 pg-check.sh 一键自检 / 第 10 节手动 SQL）
```
