-- =============================================================================
-- 012_article_online_readonly.rollback.sql · 回滚「资讯线上只读修订」
-- =============================================================================
-- 与正向脚本 012_article_online_readonly.sql 成对，逆序拆：
--   1. 删掉 012 新种的三形态样例（只按 example-012-% 标识删，011 的种子行留着）
--   2. 恢复 articles.status 的 CHECK 为 (1,2) 与列默认值 0（回到 011 的库形）——MUST 在搬回
--      已下线行之前做，否则带 status=2 的 INSERT 会撞 012 收窄出的 CHECK (status = 1)
--   3. 把草稿表 state=2 的行搬回发布表并置 status=2，删除草稿行；同标识冲突则整笔中止
--   4. ADD COLUMN published_id 与其唯一索引、ON DELETE CASCADE 外键
--      —— 列能重建，但 011 那版「哪条草稿挂在哪条线上内容」的关系无法恢复：
--      这是本迁移唯一不可逆的一列，降级为普通草稿的行不会重新挂回原线上内容
--   5. DROP COLUMN state / updated_by / uid（两表）与 view_count / published_at（草稿表），
--      连带去掉两个 UNIQUE(uid) 索引；已按 uid 落库的 audit_logs.entity_id 不回滚
--      （审计是只增不改的运维记录）
--      —— 实测后果：uid 列被删掉，前向重跑时非种子行的 uid 由列默认值重新生成，
--         回滚前写下的审计 entity_id 因此接不上重放后的内容（只有固定 uid 的 012 种子能续上）。
--         这是「回滚会切断修改记录时间线」的固有代价，不是脚本缺陷：真要回退就 MUST 连同
--         审计展示一起接受，或先按 uid 导出留痕再回退。
--
-- 执行顺序：MUST 先把后端退回 011 那版契约（副本机制与 status=2 语义），再执行本脚本；
--           只回退数据而保留新后端会让「整行搬运」的端点因列不存在而失败。
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 012_article_online_readonly.rollback.sql
-- =============================================================================

BEGIN;

-- 1. 删 012 的样例：先删发布行的种子，再删草稿侧的种子
DELETE FROM articles      WHERE slug LIKE 'example-012-%';
DELETE FROM article_drafts WHERE slug LIKE 'example-012-%';

-- 2. 先放宽状态约束：搬回来的行带 status=2，而 012 把 CHECK 收窄成 (status = 1)，
--    不先放宽就 INSERT 会直接撞约束、整笔回滚（实测报 new row violates check constraint）
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD  CONSTRAINT articles_status_check CHECK (status IN (1,2));
ALTER TABLE articles ALTER COLUMN status SET DEFAULT 0;

-- 3. 已下线条目搬回发布表：与正向脚本同样的冲突预检，同标识冲突整笔中止
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(d.slug, ', ' ORDER BY d.slug) INTO conflicts
    FROM article_drafts d JOIN articles a ON a.slug = d.slug
   WHERE d.state = 2;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '回滚中止：发布表已存在同标识行（%），请先处理后重跑本脚本', conflicts;
  END IF;
END $$;

INSERT INTO articles
  (slug, title, cover_image, summary, body, category_id, tags, author, uid, status, published_at, view_count, created_by, updated_by, created_at, updated_at)
SELECT d.slug, d.title, d.cover_image, d.summary, d.body, d.category_id, d.tags, d.author,
       d.uid, 2, d.published_at, d.view_count, d.created_by, d.updated_by, d.created_at, d.updated_at
  FROM article_drafts d
 WHERE d.state = 2;

DELETE FROM article_drafts WHERE state = 2;

COMMIT;

-- 4. 重建 published_id 列与其约束（旧副本关系无法恢复，见头注第 4 条）
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS published_id BIGINT REFERENCES articles(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS article_drafts_published_id_key ON article_drafts(published_id);

-- 5. 拆掉 012 新增的列：uid / updated_by / state / 搬运用的 view_count 与 published_at
DROP INDEX IF EXISTS articles_uid_key;
DROP INDEX IF EXISTS article_drafts_uid_key;
ALTER TABLE articles       DROP CONSTRAINT IF EXISTS articles_uid_key;
ALTER TABLE article_drafts DROP CONSTRAINT IF EXISTS article_drafts_uid_key;
ALTER TABLE article_drafts DROP CONSTRAINT IF EXISTS article_drafts_state_check;

ALTER TABLE articles       DROP COLUMN IF EXISTS uid;
ALTER TABLE articles       DROP COLUMN IF EXISTS updated_by;
ALTER TABLE article_drafts DROP COLUMN IF EXISTS uid;
ALTER TABLE article_drafts DROP COLUMN IF EXISTS updated_by;
ALTER TABLE article_drafts DROP COLUMN IF EXISTS state;
ALTER TABLE article_drafts DROP COLUMN IF EXISTS view_count;
ALTER TABLE article_drafts DROP COLUMN IF EXISTS published_at;

-- 6. 回滚后核对：期望新列全部消失（=0）、CHECK 重新允许 2、副本列回来、012 种子为空
SELECT (SELECT count(*) FROM information_schema.columns
          WHERE table_name IN ('articles','article_drafts')
            AND column_name IN ('uid','updated_by','state'))                     AS new_columns_left,
       (SELECT count(*) FROM information_schema.columns
          WHERE table_name='article_drafts' AND column_name='published_id')      AS published_id_column,
       (SELECT count(*) FROM pg_constraint
          WHERE conname='articles_status_check'
            AND pg_get_constraintdef(oid) LIKE '%2%')                            AS check_allows_2,
       (SELECT count(*) FROM articles WHERE slug LIKE 'example-012-%')           AS online_seed_rows,
       (SELECT count(*) FROM article_drafts WHERE slug LIKE 'example-012-%')     AS draft_seed_rows,
       (SELECT count(*) FROM articles WHERE status=2)                            AS offline_online_rows;
