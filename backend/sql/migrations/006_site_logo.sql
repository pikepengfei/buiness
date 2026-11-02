-- =============================================================================
-- 006_site_logo.sql · 站点设置增加品牌 Logo
-- =============================================================================
-- 背景：官网左上角 Logo 原为 WebsiteLayout.vue 硬编码的内置图片
--       （/website/img/logo-orange.png），换品牌标识只能改代码重新构建。
--       本迁移把 Logo 纳入站点设置，由「官网配置 → 站点设置」上传维护。
--
-- 变更：
--   1. 种入 site_settings.logo_url（group=general），默认值沿用当前内置图片，
--      执行后官网外观不变；此后在站点设置上传即覆盖生效
--   2. 上传接口把该值改写为固定命名对象 /uploads/brand/logo.<ext>?v=时间戳
--      —— 对象名固定，内容变化靠 ?v= 穿透浏览器与 CDN 缓存
--   3. Logo 不登记进 media 素材库：素材可删并清除物理文件，而引用扫描不覆盖
--      site_settings，登记后一次误删即会让官网顶栏 404
--
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 006_site_logo.sql
-- =============================================================================

INSERT INTO site_settings (key, value, group_name, label, description) VALUES
  ('logo_url', '/website/img/logo-orange.png', 'general', '品牌 Logo',
   '官网左上角 Logo；后台上传后改为 /uploads/brand/logo.<ext>?v=版本号')
ON CONFLICT (key) DO NOTHING;
