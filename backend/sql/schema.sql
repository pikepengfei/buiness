-- =============================================================================
-- Centremix 芯联创 · 企业官网 · 数据库建表脚本 (PostgreSQL 14+)
-- =============================================================================
-- 说明：
--   1. 本脚本为「企业官网 + 运营后台 CMS」的云端关系型数据库结构，兼容
--      PostgreSQL 14 及以上（含 Supabase / 阿里云 RDS / 腾讯云 PostgreSQL）。
--   2. 字符集：UTF8；排序规则：默认（建议 C / zh_Hans_CN.UTF8）。
--   3. 主键统一使用 BIGSERIAL（INT8 自增），对外暴露时建议以 slug/uuid 作为
--      不可枚举的公开标识（见各表 slug / object_key 字段）。
--   4. 所有时间字段均为 TIMESTAMPTZ（带时区，UTC 存储）。
--   5. 执行顺序：先建表，再建索引与 FK，最后建 updated_at 触发器与种子数据。
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- 提供 gen_random_uuid() 等函数
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- 三元组索引，支撑中英文 ILIKE 模糊搜索加速

-- -----------------------------------------------------------------------------
-- 0. 通用 updated_at 触发器（所有带 updated_at 的表复用）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. 用户与权限 (RBAC)
-- =============================================================================

-- 1.1 角色表 -----------------------------------------------------------------
CREATE TABLE roles (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(50)  NOT NULL UNIQUE,          -- super_admin / editor / operator
  name        VARCHAR(50)  NOT NULL,                -- 超级管理员 / 内容编辑 / 运营
  description VARCHAR(255),
  permissions JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 权限点数组，如 ["content:read","content:write"]
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'RBAC 角色，权限点采用 JSONB 数组存储';

-- 1.2 用户表 -----------------------------------------------------------------
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(120) UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,             -- bcrypt，cost=12
  display_name   VARCHAR(50)  NOT NULL,
  avatar_url     TEXT,
  role_id        BIGINT       NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status         SMALLINT     NOT NULL DEFAULT 1,   -- 1=启用 0=禁用
  last_login_at  TIMESTAMPTZ,
  last_login_ip  VARCHAR(64),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE users IS '运营后台账号；首个管理员通过 setup-admin 脚本创建';

-- 1.3 会话 / 刷新令牌表 ------------------------------------------------------
CREATE TABLE user_sessions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT   NOT NULL,               -- 仅存哈希，原始 token 不落库
  expires_at   TIMESTAMPTZ  NOT NULL,
  ip           VARCHAR(64),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user  ON user_sessions(user_id);
CREATE INDEX idx_sessions_exp   ON user_sessions(expires_at);

-- 1.4 登录日志表 -------------------------------------------------------------
CREATE TABLE login_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip         VARCHAR(64),
  user_agent TEXT,
  success    BOOLEAN      NOT NULL,
  reason     VARCHAR(100),                          -- 失败原因：密码错误/账号禁用/锁定
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_logs_created ON login_logs(created_at DESC);

-- =============================================================================
-- 2. 站点配置与导航
-- =============================================================================

-- 2.1 站点设置（KV 表，支持分组） -------------------------------------------
CREATE TABLE site_settings (
  id          BIGSERIAL PRIMARY KEY,
  key         VARCHAR(80)  NOT NULL UNIQUE,
  value       TEXT,
  group_name  VARCHAR(40)  NOT NULL DEFAULT 'general', -- general/seo/social/contact
  label       VARCHAR(80),
  description VARCHAR(255),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE site_settings IS '全局配置：站点名称、Slogan、联系方式、SEO、社媒链接';

-- 2.2 导航菜单（支持多级树） -------------------------------------------------
-- location 决定这一条挂在官网哪个导航位；页脚/CTA 与顶栏共用一表，
-- 因此 url 唯一性只约束顶栏（同一链接允许在页脚重复出现，也允许列标题不带链接）。
CREATE TABLE menus (
  id         BIGSERIAL PRIMARY KEY,
  parent_id  BIGINT REFERENCES menus(id) ON DELETE CASCADE,
  title      VARCHAR(50)  NOT NULL,
  url        VARCHAR(255),                          -- 导航链接；footer 顶级分组为列标题，可为空
  target     VARCHAR(10)  DEFAULT '_self',          -- _self / _blank
  location   VARCHAR(20)  NOT NULL DEFAULT 'header'
               CHECK (location IN ('header', 'footer', 'cta')),
  sort       INT          NOT NULL DEFAULT 0,
  status     SMALLINT     NOT NULL DEFAULT 1,       -- 1=显示 0=隐藏
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_menus_parent ON menus(parent_id, sort);
CREATE UNIQUE INDEX menus_header_url_key ON menus(url) WHERE location = 'header';

-- =============================================================================
-- 3. 内容管理 (CMS)
-- =============================================================================

-- 3.1 可编辑单页（关于我们 / 公司介绍等） -----------------------------------
CREATE TABLE pages (
  id              BIGSERIAL PRIMARY KEY,
  slug            VARCHAR(80)  NOT NULL UNIQUE,     -- about / company / privacy ...
  title           VARCHAR(120) NOT NULL,
  meta_title      VARCHAR(160),
  meta_description VARCHAR(300),
  hero_image      TEXT,
  status          SMALLINT     NOT NULL DEFAULT 1,   -- 1=已发布 0=草稿
  published_at    TIMESTAMPTZ,
  content_json    JSONB        NOT NULL DEFAULT '{}'::jsonb, -- 线上正式内容：{ blocks:[{id,type,visible,props}] }（见 migrations/002_page_blocks.sql）
  draft_json      JSONB        NOT NULL DEFAULT '{}'::jsonb, -- 管理端草稿内容，发布时覆盖 content_json
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_pages_updated_at BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.2 资讯分类 ---------------------------------------------------------------
CREATE TABLE article_categories (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  description VARCHAR(255),
  sort        INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3.3 资讯 / 文章（发布表：对外可见，只读且不可删除，唯一动作是下线） ----------
-- 本表只放正在上线的条目，一行 = 一份线上内容。改写它的只有两个动作：
-- 发布（未发布行整行搬入）与下线（整行搬回 article_drafts）。见 migrations/012_article_online_readonly.sql
CREATE TABLE articles (
  id           BIGSERIAL PRIMARY KEY,
  uid          UUID         NOT NULL DEFAULT gen_random_uuid(), -- 内容身份：跨表搬运不改，本表内唯一；审计 entity_id 记本列
  slug         VARCHAR(100) NOT NULL UNIQUE,       -- 线上标识，决定官网地址 /article/{slug}
  title        VARCHAR(200) NOT NULL,
  cover_image  TEXT,
  summary      VARCHAR(400),
  body         TEXT,                               -- 线上正文（XSS 清洗后），只由发布动作整行搬运进来，编辑动作写不到这里
  category_id  BIGINT REFERENCES article_categories(id) ON DELETE SET NULL,
  tags         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  author       VARCHAR(50),                        -- 稿件来源署名（对外），与「后台谁改的」无关
  status       SMALLINT     NOT NULL DEFAULT 1 CHECK (status = 1), -- 恒 1，只作已上线标记；下线状态见 article_drafts.state
  published_at TIMESTAMPTZ,
  view_count   INT          NOT NULL DEFAULT 0,    -- 由显式上报累加；发布与下线都随行搬运，不清零
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL, -- 最后修改人，不是创建人；每个写路径刷新
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX articles_uid_key ON articles(uid);
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_articles_cat     ON articles(category_id);
CREATE INDEX idx_articles_status  ON articles(status, published_at DESC);
CREATE INDEX idx_articles_search  ON articles USING gin(to_tsvector('simple', title || ' ' || coalesce(summary,'') || ' ' || coalesce(body,'')));

-- 3.3.1 资讯未发布内容（草稿表：对外不可见，所有编辑动作与删除的唯一落点） ------
-- state=0 从未发布的草稿；state=2 曾上线、下线时整行搬回的条目（可编辑、可删除、可重新发布）。
-- 一条条目同一时刻只存在于一张表，故没有「是否存在未发布改动」这一概念。
-- 迁移先后：011（建本表与副本机制）→ 012（加 uid/updated_by/state、回收下线行、DROP published_id）
CREATE TABLE article_drafts (
  id           BIGSERIAL PRIMARY KEY,
  uid          UUID         NOT NULL DEFAULT gen_random_uuid(), -- 内容身份：与 articles.uid 同值随行搬运，不得重新生成
  slug         VARCHAR(100) NOT NULL UNIQUE,       -- 未发布标识，与 articles.slug 跨两表共同判唯一
  title        VARCHAR(200) NOT NULL,
  cover_image  TEXT,
  summary      VARCHAR(400),
  body         TEXT,                               -- 未发布正文，官网任何公开接口都不读取本表
  category_id  BIGINT REFERENCES article_categories(id) ON DELETE SET NULL,
  tags         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  author       VARCHAR(50),
  state        SMALLINT     NOT NULL DEFAULT 0 CHECK (state IN (0,2)), -- 0=草稿 2=已下线；已上线不写本表，故无 1
  view_count   INT          NOT NULL DEFAULT 0,    -- 随行搬运的浏览计数：下线带下来、发布搬回去，不因换表清零
  published_at TIMESTAMPTZ,                        -- 随行搬运的首次发布时间：再发布不覆盖；纯草稿为 NULL
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL, -- 最后修改人，不是创建人
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX article_drafts_uid_key ON article_drafts(uid);
CREATE INDEX idx_article_drafts_cat ON article_drafts(category_id);
CREATE TRIGGER trg_article_drafts_updated_at BEFORE UPDATE ON article_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.3.2 资讯浏览判重明细（同一访客 24 小时内重复访问不计数，按周清理） -----------
-- 外键带 ON DELETE CASCADE：下线本身就是「移除线上行」，明细随之清空、不留孤儿。
-- 后果是「下线—再上线」会重置该条的判重窗口（同一访客至多多计一次），本 change 接受这条有界偏差
CREATE TABLE article_view_dedupe (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT       NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  visitor_key VARCHAR(64)  NOT NULL,               -- IP 哈希 + UA 摘要
  seen_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_article_view_dedupe_window ON article_view_dedupe(article_id, visitor_key, seen_at);

-- 3.4 产品分类（支持多级） ---------------------------------------------------
CREATE TABLE product_categories (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  parent_id   BIGINT REFERENCES product_categories(id) ON DELETE CASCADE,
  sort        INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prod_cat_parent ON product_categories(parent_id, sort);

-- 3.5 产品（发布表：对外可见，只读且不可删除，唯一动作是下架 + 调整排序值） ------
-- 本表只放正在上架的产品，一行 = 一份线上内容。改写它的只有三个动作：
-- 发布（未上线行整行搬入）、下架（整行搬回 product_drafts）、调整列表排序值。
-- 见 migrations/010_product_flow.sql
CREATE TABLE products (
  id           BIGSERIAL PRIMARY KEY,
  uid          UUID         NOT NULL DEFAULT gen_random_uuid(), -- 内容身份：跨表搬运不改，本表内唯一；审计 entity_id 记本列
  slug         VARCHAR(120) NOT NULL UNIQUE,       -- 线上标识，决定官网地址 /product/{slug}
  name         VARCHAR(160) NOT NULL,
  category_id  BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  series       VARCHAR(80),                         -- 产品系列，如 Exos / BarraCuda / LaCie
  cover_image  TEXT,
  gallery      JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 图集：可直接渲染的图片地址数组（≤8），不是 object_key
  summary      VARCHAR(400),
  description  TEXT,                                -- 详细描述（XSS 清洗后的富文本），可为空
  specs        JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 规格参数 {label,value} 有序数组（≤20，行序即展示序）
  highlights   JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 卖点（≤8）
  price_text   VARCHAR(60),                         -- 展示价（避免货币精度问题，存文本）
  buy_link     TEXT,                                -- 天猫 / 京东 外链
  status       SMALLINT     NOT NULL DEFAULT 1 CHECK (status = 1), -- 恒 1，只作已上架标记；已下架状态见 product_drafts.state
  sort         INT          NOT NULL DEFAULT 0,     -- 线上行唯一可写列，只由 POST /products/:id/sort 改写
  published_at TIMESTAMPTZ,                         -- 首次上架时间：发布写入一次，再上架不覆盖
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL, -- 最后修改人，不是创建人；每个写路径刷新
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX products_uid_key ON products(uid);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_products_cat    ON products(category_id);
CREATE INDEX idx_products_status ON products(status, sort);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('simple', name || ' ' || coalesce(summary,'') || ' ' || coalesce(series,'')));

-- 3.5.1 产品未上架内容（草稿表：对外不可见，所有编辑动作与删除的唯一落点） ------
-- state=0 从未上架的草稿；state=2 曾上架、下架时整行搬回的产品（可编辑、可删除、可重新发布）。
-- 一条产品同一时刻只存在于一张表，故没有「是否存在未发布改动」这一概念。
-- 与资讯链 011→012 是不同表与不同约束，仅编号连续登记、无执行顺序依赖。
CREATE TABLE product_drafts (
  id           BIGSERIAL PRIMARY KEY,
  uid          UUID         NOT NULL DEFAULT gen_random_uuid(), -- 内容身份：与 products.uid 同值随行搬运，不得重新生成
  slug         VARCHAR(120) NOT NULL UNIQUE,       -- 未上架标识，与 products.slug 跨两表共同判唯一
  name         VARCHAR(160) NOT NULL,
  category_id  BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  series       VARCHAR(80),
  cover_image  TEXT,
  gallery      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  summary      VARCHAR(400),
  description  TEXT,                                -- 未上架描述，官网任何公开接口都不读取本表
  specs        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  highlights   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  price_text   VARCHAR(60),
  buy_link     TEXT,
  state        SMALLINT     NOT NULL DEFAULT 0 CHECK (state IN (0,2)), -- 0=草稿 2=已下架；已上架不写本表，故无 1
  sort         INT          NOT NULL DEFAULT 0,     -- 随行搬运的排序值：下架带下来、再上架搬回去，不因换表重置
  published_at TIMESTAMPTZ,                         -- 随行搬运的首次上架时间：再上架不覆盖；纯草稿为 NULL
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL, -- 最后修改人，不是创建人
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX product_drafts_uid_key ON product_drafts(uid);
CREATE INDEX idx_product_drafts_cat ON product_drafts(category_id);
CREATE TRIGGER trg_product_drafts_updated_at BEFORE UPDATE ON product_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.6 Banner / 广告位 --------------------------------------------------------
CREATE TABLE banners (
  id         BIGSERIAL PRIMARY KEY,
  title      VARCHAR(120),
  image_url  TEXT         NOT NULL,
  link_url   TEXT,
  position   VARCHAR(40)  NOT NULL DEFAULT 'home', -- home / products / news ...
  sort       INT          NOT NULL DEFAULT 0,
  status     SMALLINT     NOT NULL DEFAULT 1,
  start_at   TIMESTAMPTZ,
  end_at     TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_banners_updated_at BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_banners_pos ON banners(position, status, sort);

-- 3.7 FAQ（售后服务 / 保修政策） ---------------------------------------------
CREATE TABLE faqs (
  id         BIGSERIAL PRIMARY KEY,
  question   VARCHAR(255) NOT NULL,
  answer     TEXT         NOT NULL,
  category   VARCHAR(40)  DEFAULT 'general',       -- general / warranty / repair / return
  sort       INT          NOT NULL DEFAULT 0,
  status     SMALLINT     NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_faqs_cat ON faqs(category, sort);

-- 3.8 媒体库 -----------------------------------------------------------------
CREATE TABLE media (
  id            BIGSERIAL PRIMARY KEY,
  filename      VARCHAR(255) NOT NULL,             -- 存储对象名（object_key）
  original_name VARCHAR(255),
  mime_type     VARCHAR(80),
  size          BIGINT,
  width         INT,
  height        INT,
  bucket        VARCHAR(80)  NOT NULL DEFAULT 'website',
  object_key    TEXT         NOT NULL,             -- 云端存储对象键
  url           TEXT         NOT NULL,             -- 可访问 URL（CDN）
  category      VARCHAR(40)  DEFAULT 'general',
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_media_cat ON media(category, created_at DESC);

-- =============================================================================
-- 4. 表单与线索（转化）
-- =============================================================================
-- 状态机：0=新线索 1=跟进中 2=已成交 3=无效  (inquiry/cooperation/contact 共用)
-- 4.1 询价表单 ---------------------------------------------------------------
CREATE TABLE inquiries (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  phone       VARCHAR(40),
  email       VARCHAR(120),
  company     VARCHAR(120),
  need_type   VARCHAR(40),                          -- 批量采购 / 定制 / 渠道
  product_id  BIGINT REFERENCES products(id) ON DELETE SET NULL, -- 提交时指向的线上行主键；产品下架后被置空
  product_uid UUID,                                 -- 提交时那条产品的内容身份：跨表搬运与再发布都不变，线索追溯用它
  message     TEXT,
  status      SMALLINT     NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3)),
  handled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_inquiries_updated_at BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_inquiries_status ON inquiries(status, created_at DESC);
CREATE INDEX idx_inquiries_product_uid ON inquiries(product_uid);

-- 4.2 合作意向表单 -----------------------------------------------------------
CREATE TABLE cooperation (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  phone       VARCHAR(40),
  email       VARCHAR(120),
  company     VARCHAR(120),
  coop_type   VARCHAR(40),                          -- 渠道 / 内容 / 企业采购
  message     TEXT,
  status      SMALLINT     NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3)),
  handled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_cooperation_updated_at BEFORE UPDATE ON cooperation
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_cooperation_status ON cooperation(status, created_at DESC);

-- 4.3 订阅表单 ---------------------------------------------------------------
CREATE TABLE subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(120) NOT NULL UNIQUE,
  type       VARCHAR(40)  NOT NULL DEFAULT 'news', -- news / product
  status     SMALLINT     NOT NULL DEFAULT 1,      -- 1=订阅 0=取消
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4.4 联系 / 售后表单 --------------------------------------------------------
CREATE TABLE contact_messages (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  phone       VARCHAR(40),
  email       VARCHAR(120),
  type        VARCHAR(40),                          -- 保修 / 维修 / 退换 / 咨询
  message     TEXT         NOT NULL,
  status      SMALLINT     NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3)),
  handled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contact_status ON contact_messages(status, created_at DESC);

-- =============================================================================
-- 5. 审计日志（CMS-06 操作留痕）
-- =============================================================================
CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(40)  NOT NULL,              -- create / update / delete / login / publish
  entity_type  VARCHAR(40)  NOT NULL,              -- product / article / page / user ...
  entity_id    VARCHAR(40),
  diff         JSONB,
  ip           VARCHAR(64),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================================================
-- 5.5 性能优化补充索引（安全加固与查询加速）
-- =============================================================================
-- 登录日志按用户 + 时间倒序（审计/异常登录排查）
CREATE INDEX idx_login_logs_user ON login_logs(user_id, created_at DESC);
-- 审计日志按操作人 + 时间倒序（“我的操作”筛选）
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
-- 公开产品列表：状态 + 分类 + 排序 复合覆盖
CREATE INDEX idx_products_public ON products(status, category_id, sort);
-- 媒体对象键唯一（防止重复登记同一 object_key）
CREATE UNIQUE INDEX idx_media_object_key ON media(object_key);
-- 三元组模糊索引：支撑 /public/search 与产品/资讯列表的 ILIKE '%kw%' 加速
CREATE INDEX idx_products_name_trgm  ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_series_trgm ON products USING gin(coalesce(series,'') gin_trgm_ops);
CREATE INDEX idx_articles_title_trgm ON articles USING gin(title gin_trgm_ops);

-- =============================================================================
-- 6. 种子数据（角色、站点设置、导航菜单）
--    注：首个管理员账号请运行 `npm run setup-admin` 创建（密码经 bcrypt 哈希）。
-- =============================================================================
INSERT INTO roles (code, name, description, permissions) VALUES
  ('super_admin', '超级管理员', '拥有全部权限', '["*"]'::jsonb),
  ('editor',      '内容编辑',   '产品/资讯/页面内容维护', '["content:read","content:write","media:write"]'::jsonb),
  ('operator',    '运营',       '表单线索跟进与基础配置', '["content:read","lead:read","lead:write"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO site_settings (key, value, group_name, label, description) VALUES
  ('site_name',     'Centremix 芯联创',        'general', '站点名称',   '官网标题'),
  ('slogan',        '聚焦你的多元，存储你的生活', 'general', '品牌 Slogan', '核心标语'),
  ('brand_color',   '#DE6420',                  'general', '品牌主色',   'VIS 规范橙（与官网设计稿 style.css 一致；设计分析曾提红 #E40013，以 VIS 硬约束与实现稿为准）'),
  ('logo_url',      '/website/img/logo-orange.png', 'general', '品牌 Logo', '官网左上角 Logo；后台上传后改为 /uploads/brand/logo.<ext>?v=版本号'),
  ('company_name',  '北京展创振华科技有限公司',     'general', '公司全称',   '工商主体'),
  ('contact_email', 'info@centremix.com',       'contact', '联系邮箱',   '对外邮箱'),
  ('contact_phone', '010-62887359',             'contact', '联系电话',   '对外电话'),
  ('address',       '北京市海淀区',             'contact', '办公地址',   '公司地址'),
  ('icp',           '京ICP备XXXXXXXX号',         'general', '备案号',     'ICP 备案'),
  ('seo_title',     'Centremix 芯联创 | 数据存储专家', 'seo', 'SEO 标题', '首页 title'),
  ('seo_desc',      'Centremix 芯联创，2022 年与希捷工厂深度合作创立，以「便捷存储」为核心的存储产品品牌。', 'seo', 'SEO 描述', '首页 description'),
  ('social_tmall',  'https://www.tmall.com',    'social',  '天猫店铺',   '外链'),
  ('social_xhs',    'https://www.xiaohongshu.com', 'social', '小红书',    '外链')
ON CONFLICT (key) DO NOTHING;

-- 顶栏导航种子；页脚两列与右上角 CTA 由 migrations/004_menu_locations.sql 种入
INSERT INTO menus (location, parent_id, title, url, sort) VALUES
  ('header', NULL, '首页',     '/',            1),
  ('header', NULL, '关于我们', '/about',       2),
  ('header', NULL, '产品中心', '/products',    3),
  ('header', NULL, '新闻资讯', '/news',        4),
  ('header', NULL, '售后服务', '/contact',     5)
ON CONFLICT (url) WHERE location = 'header' DO NOTHING;
