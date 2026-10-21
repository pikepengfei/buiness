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
CREATE TABLE menus (
  id         BIGSERIAL PRIMARY KEY,
  parent_id  BIGINT REFERENCES menus(id) ON DELETE CASCADE,
  title      VARCHAR(50)  NOT NULL,
  url        VARCHAR(255) NOT NULL UNIQUE,          -- 导航项 URL 唯一，保证种子可幂等写入
  target     VARCHAR(10)  DEFAULT '_self',          -- _self / _blank
  sort       INT          NOT NULL DEFAULT 0,
  status     SMALLINT     NOT NULL DEFAULT 1,       -- 1=显示 0=隐藏
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_menus_parent ON menus(parent_id, sort);

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

-- 3.3 资讯 / 文章 ------------------------------------------------------------
CREATE TABLE articles (
  id           BIGSERIAL PRIMARY KEY,
  slug         VARCHAR(100) NOT NULL UNIQUE,
  title        VARCHAR(200) NOT NULL,
  cover_image  TEXT,
  summary      VARCHAR(400),
  body         TEXT,                                -- 富文本 / HTML（后端做 XSS 清洗）
  category_id  BIGINT REFERENCES article_categories(id) ON DELETE SET NULL,
  tags         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  author       VARCHAR(50),
  status       SMALLINT     NOT NULL DEFAULT 0 CHECK (status IN (0,1,2)), -- 0=草稿 1=已发布 2=已下线
  published_at TIMESTAMPTZ,
  view_count   INT          NOT NULL DEFAULT 0,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_articles_cat     ON articles(category_id);
CREATE INDEX idx_articles_status  ON articles(status, published_at DESC);
CREATE INDEX idx_articles_search  ON articles USING gin(to_tsvector('simple', title || ' ' || coalesce(summary,'') || ' ' || coalesce(body,'')));

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

-- 3.5 产品 -------------------------------------------------------------------
CREATE TABLE products (
  id           BIGSERIAL PRIMARY KEY,
  slug         VARCHAR(120) NOT NULL UNIQUE,
  name         VARCHAR(160) NOT NULL,
  category_id  BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  series       VARCHAR(80),                         -- 产品系列，如 Exos / BarraCuda / LaCie
  cover_image  TEXT,
  gallery      JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 图集 object_key 数组
  summary      VARCHAR(400),
  description  TEXT,
  specs        JSONB        NOT NULL DEFAULT '{}'::jsonb, -- 参数表（键值对数组）
  highlights   JSONB        NOT NULL DEFAULT '[]'::jsonb, -- 卖点
  price_text   VARCHAR(60),                         -- 展示价（避免货币精度问题，存文本）
  buy_link     TEXT,                                -- 天猫 / 京东 外链
  status       SMALLINT     NOT NULL DEFAULT 1 CHECK (status IN (0,1)),  -- 1=上架 0=下架
  sort         INT          NOT NULL DEFAULT 0,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_products_cat    ON products(category_id);
CREATE INDEX idx_products_status ON products(status, sort);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('simple', name || ' ' || coalesce(summary,'') || ' ' || coalesce(series,'')));

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
  product_id  BIGINT REFERENCES products(id) ON DELETE SET NULL,
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

INSERT INTO menus (parent_id, title, url, sort) VALUES
  (NULL, '首页',     '/',            1),
  (NULL, '关于我们', '/about',       2),
  (NULL, '产品中心', '/products',    3),
  (NULL, '新闻咨询', '/news',        4),
  (NULL, '售后服务', '/contact',     5)
ON CONFLICT (url) DO NOTHING;
