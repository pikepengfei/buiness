-- =============================================================================
-- 011_article_flow.rollback.sql · 回滚「资讯链双表地基」
-- =============================================================================
-- 与正向脚本 011_article_flow.sql 成对，逆序拆：
--   1. 删种子内容（先删副本行再删发布行，顺带验证一次 ON DELETE CASCADE 的方向）
--   2. 把草稿表里剩下的纯草稿行搬回发布表（status=0），已发布条目的副本行随表一起丢弃
--      —— 副本的内容本就来自发布行，回滚后线上内容仍是最后一次发布的版本
--   3. DROP TABLE article_drafts、恢复 articles.status 的 CHECK 为 (0,1,2)
--   4. DROP TABLE article_view_dedupe
--
-- 执行顺序：MUST 先回滚后端（按草稿 id 读写的端点依赖这两张表），再执行本脚本；
--           只回退本脚本而保留后端会让端点因表不存在而失败。
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 011_article_flow.rollback.sql
--       种子分类只在「已无任何资讯引用」时才删除：本机的 news/buiness 两个分类早于本
--       迁移存在（正向脚本因 WHERE NOT EXISTS 并未插入它们），无条件删除会带走运营数据。
-- =============================================================================

BEGIN;

-- 1. 删种子内容：先删副本行（顺带验证级联：删发布行时其明细与副本一并消失）
DELETE FROM article_drafts
 WHERE slug IN ('example-storage-insight', 'example-draft-only');

DELETE FROM articles
 WHERE slug IN ('example-brand-launch', 'example-storage-insight', 'example-offline-notice');

-- 2. 草稿行搬回发布表：只搬「从未发布」的行（published_id 为空）
--    标识与既有发布行冲突的草稿无处可回，直接丢弃并在末尾输出计数供人工比对
INSERT INTO articles (slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by, created_at, updated_at)
SELECT d.slug, d.title, d.cover_image, d.summary, d.body, d.category_id, d.tags, d.author,
       0, NULL, 0, d.created_by, d.created_at, d.updated_at
  FROM article_drafts d
 WHERE d.published_id IS NULL
ON CONFLICT (slug) DO NOTHING;

-- 3. 拆除草稿表与收窄的状态约束
DROP TABLE IF EXISTS article_drafts;

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD CONSTRAINT articles_status_check CHECK (status IN (0,1,2));

COMMIT;

-- 4. 去重明细表：浏览计数原先在 GET 里自增，不需要它也能跑，故直接删
DROP TABLE IF EXISTS article_view_dedupe;

-- 5. 种子分类：仅在没有任何资讯引用时删除（两表都查，本脚本执行后 article_drafts 已不存在）
DELETE FROM article_categories c
 WHERE c.slug IN ('news', 'buiness')
   AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.category_id = c.id);

-- 6. 回滚后核对：期望两张新表均不存在（=0）、status 允许 0、种子标识已消失
SELECT (SELECT count(*) FROM pg_tables WHERE tablename = 'article_drafts')      AS drafts_table,
       (SELECT count(*) FROM pg_tables WHERE tablename = 'article_view_dedupe') AS dedupe_table,
       (SELECT count(*) FROM pg_constraint
         WHERE conname = 'articles_status_check'
           AND pg_get_constraintdef(oid) LIKE '%0,%')                           AS check_allows_0,
       (SELECT count(*) FROM articles WHERE slug LIKE 'example-%')              AS seed_rows,
       (SELECT count(*) FROM article_categories WHERE slug IN ('news','buiness')) AS seed_categories;
