-- =============================================================================
-- 004_menu_locations.sql · 导航菜单按「位置」分区
-- =============================================================================
-- 背景：官网右上角 CTA 按钮与页脚两列链接原为 WebsiteLayout.vue 硬编码，运营在
--       「导航菜单」里改名（如 售后服务 → 联系我们）只影响顶栏，CTA 与页脚仍是
--       旧文案，表现为「改了没生效」。本迁移把这三类导航位统一交给 menus 表驱动。
--
-- 变更：
--   1. 增 location：header=顶栏 / footer=页脚分组 / cta=右上角按钮
--   2. url 改为可空：footer 的列标题是分组名，本身不是链接
--   3. 唯一性由全局 UNIQUE(url) 收窄为顶栏内唯一（partial index）：
--      页脚「品牌故事 / 品牌理念 / 公司背书」同指 /about，跨位置与同位重复都需允许
--   4. 按迁移前官网的实际显示 1:1 种入 cta 与 footer，执行后官网外观不变；
--      此后要统一文案（例如改成「联系我们」）在「导航菜单」页编辑即可生效
--
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 004_menu_locations.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 结构变更
-- -----------------------------------------------------------------------------
ALTER TABLE menus ADD COLUMN IF NOT EXISTS location VARCHAR(20) NOT NULL DEFAULT 'header';

ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_location_check;
ALTER TABLE menus ADD CONSTRAINT menus_location_check CHECK (location IN ('header', 'footer', 'cta'));

ALTER TABLE menus ALTER COLUMN url DROP NOT NULL;

ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS menus_header_url_key ON menus (url) WHERE location = 'header';

COMMENT ON COLUMN menus.location IS '导航位：header=顶栏 footer=页脚分组 cta=右上角按钮';
COMMENT ON COLUMN menus.url IS '导航链接；footer 顶级分组为列标题，可为 NULL';

-- -----------------------------------------------------------------------------
-- 2. 顶栏既有数据回填位置（DEFAULT 已覆盖，显式写入便于重复执行时核对）
-- -----------------------------------------------------------------------------
UPDATE menus SET location = 'header' WHERE location IS NULL OR location = 'header';

-- -----------------------------------------------------------------------------
-- 3. 右上角 CTA：迁移前 WebsiteLayout 写死的「售后服务 →」
-- -----------------------------------------------------------------------------
INSERT INTO menus (location, parent_id, title, url, target, sort, status)
SELECT 'cta', NULL, '售后服务', '/contact', '_self', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE location = 'cta');

-- -----------------------------------------------------------------------------
-- 4. 页脚两列：迁移前 WebsiteLayout 写死的「公司介绍」「产品与服务」
-- -----------------------------------------------------------------------------
INSERT INTO menus (location, parent_id, title, url, sort, status)
SELECT 'footer', NULL, v.title, NULL, v.sort, 1
FROM (VALUES ('公司介绍', 1), ('产品与服务', 2)) AS v(title, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM menus m WHERE m.location = 'footer' AND m.parent_id IS NULL AND m.title = v.title
);

INSERT INTO menus (location, parent_id, title, url, sort, status)
SELECT 'footer', g.id, v.title, v.url, v.sort, 1
FROM (VALUES
  ('公司介绍', '品牌故事', '/about',    1),
  ('公司介绍', '品牌理念', '/about',    2),
  ('公司介绍', '公司背书', '/about',    3),
  ('公司介绍', '新闻咨询', '/news',     4),
  ('产品与服务', '产品中心', '/products', 1),
  ('产品与服务', '产品详情', '/products', 2),
  ('产品与服务', '售后服务', '/contact',  3),
  ('产品与服务', '站内搜索', '/search',   4)
) AS v(group_title, title, url, sort)
JOIN menus g ON g.location = 'footer' AND g.parent_id IS NULL AND g.title = v.group_title
WHERE NOT EXISTS (
  SELECT 1 FROM menus c WHERE c.parent_id = g.id AND c.title = v.title
);
