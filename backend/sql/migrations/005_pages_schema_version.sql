-- 005_pages_schema_version.sql
-- 区块结构版本化（落地建议 P3：向前兼容迁移的「可查询版本号」）
-- 说明：
--   · 前端已在 parseBlocks 内做「读取时向前兼容迁移」（blocks.ts 的 MIGRATIONS + CURRENT_BLOCK_SCHEMA_VERSION），
--     因此本列不是渲染正确性的前置依赖，而是为了让「哪些页面尚未升级到当前区块结构」可被查询（kuray.dev 实践）。
--   · 应用后，建议在 backend/src/routes/content.ts 的 POST /pages 与 PUT /pages/:id/draft 中写入
--     schema_version = CURRENT_BLOCK_SCHEMA_VERSION（前端常量值），以便后续按版本做增量迁移扫描。
--   · 历史行统一标记为当前版本 1。

ALTER TABLE pages ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
UPDATE pages SET schema_version = 1 WHERE schema_version IS DISTINCT FROM 1;
COMMENT ON COLUMN pages.schema_version IS '区块结构版本；前端 parseBlocks 按此做向前兼容迁移（落地建议 P3）';
