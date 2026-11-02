-- =============================================================================
-- 010_product_flow.rollback.sql · 回滚「产品链双表落地」
-- =============================================================================
-- 与正向脚本 010_product_flow.sql 成对，逆序拆：
--   1. 删掉 010 新种的四形态样例与两个样例分类（只按 example-010-% / example-enterprise-hdd
--      与 example-consumer-ddr 标识删，运营自建的行留着）
--   2. 放宽发布表状态约束回 CHECK (status IN (0,1))——MUST 在搬回已下架行之前做，
--      否则带 status=0 的 INSERT 会撞 010 收窄出的 CHECK (status = 1)
--   3. 把未上线表 state=2 的行搬回 products 并置 status=0，删除这些未上线行；同标识冲突整笔中止
--   4. 撤销「纯文本包 <p>」：只解开「整体恰好是一个 <p>…</p> 且不含其它标签」的行，
--       genuinely 富文本的行不动（回滚不该破坏内容）
--   5. DROP COLUMN inquiries.product_uid 与其索引——回填过的内容身份随之消失，
--      线索退回「只有 product_id、下架即失归属」的旧语义
--   6. products 撤掉 uid / updated_by / published_at 与其 UNIQUE 索引；
--      已按 uid 落库的 audit_logs.entity_id 不回滚（审计是只增不改的运维记录），
--      后果同 012：回滚后非种子行的 uid 由列默认值重新生成，回滚前写下的时间线接不上
--   7. DROP TABLE product_drafts（连带其触发器、两个索引与外键）
--   8. products.specs 列默认回 '{}'::jsonb——但**不把已经归一成 [] 的行改回 {}**：
--      空列表是合法形态，反向制造畸形数据没有意义，也让正向重跑失去幂等依据
--
-- 执行顺序：MUST 先把后端退回单表契约（POST/PATCH /products 与 status 0/1 语义），再执行本脚本；
--           只回退数据而保留新后端会让「整行搬运」的端点因表不存在而硬失败。
--           反向操作「回退后端但保留双表数据」是安全的：发布表内容从未被编辑动作改过。
-- 说明：幂等，可重复执行。执行：
--         /usr/local/postgres16/bin/psql -d centremix -f backend/sql/migrations/010_product_flow.rollback.sql
-- =============================================================================

BEGIN;

-- 1. 删 010 的样例：先删两侧产品行，再删样例分类
DELETE FROM products       WHERE slug LIKE 'example-010-%';
DELETE FROM product_drafts WHERE slug LIKE 'example-010-%';
DELETE FROM product_categories WHERE slug IN ('example-enterprise-hdd', 'example-consumer-ddr');

-- 2. 先放宽状态约束（搬回来的行带 status=0）
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD  CONSTRAINT products_status_check CHECK (status IN (0,1));
ALTER TABLE products ALTER COLUMN status SET DEFAULT 1;

-- 3. 已下架内容搬回发布表：与正向脚本同样的冲突预检，同标识冲突整笔中止
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(d.slug, ', ' ORDER BY d.slug) INTO conflicts
    FROM product_drafts d JOIN products p ON p.slug = d.slug
   WHERE d.state = 2;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '回滚中止：发布表已存在同标识行（%），请先处理后重跑本脚本', conflicts;
  END IF;
END $$;

INSERT INTO products
  (slug, name, category_id, series, cover_image, gallery, summary, description,
   specs, highlights, price_text, buy_link, uid, status, sort, published_at,
   created_by, updated_by, created_at, updated_at)
SELECT d.slug, d.name, d.category_id, d.series, d.cover_image, d.gallery, d.summary, d.description,
       d.specs, d.highlights, d.price_text, d.buy_link, d.uid, 0, d.sort, d.published_at,
       d.created_by, d.updated_by, d.created_at, d.updated_at
  FROM product_drafts d
 WHERE d.state = 2;

DELETE FROM product_drafts WHERE state = 2;

COMMIT;

-- 4. 撤销纯文本包裹：只处理「<p> 单层且内部无其它标签」的行，并回解正向写入的 &amp;
--    genuinely 富文本的行（regex 不匹配）一律不动——回滚不该破坏内容
UPDATE products
   SET description = replace(btrim(substring(description, '^<p>(.*)</p>$')), '&amp;', '&')
 WHERE description ~ '^<p>[^<]*</p>$';

UPDATE product_drafts
   SET description = replace(btrim(substring(description, '^<p>(.*)</p>$')), '&amp;', '&')
 WHERE description ~ '^<p>[^<]*</p>$';

-- 5. 拆掉线索的内容身份列（product_id 外键与 ON DELETE SET NULL 从未被本迁移改过，无需恢复）
DROP INDEX IF EXISTS idx_inquiries_product_uid;
ALTER TABLE inquiries DROP COLUMN IF EXISTS product_uid;

-- 6. 拆掉 products 的新列
DROP INDEX IF EXISTS products_uid_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_uid_key;
ALTER TABLE products DROP COLUMN IF EXISTS uid;
ALTER TABLE products DROP COLUMN IF EXISTS updated_by;
ALTER TABLE products DROP COLUMN IF EXISTS published_at;

-- 7. 撤掉未上线表（触发器与索引随表一起消失）
DROP TRIGGER IF EXISTS trg_product_drafts_updated_at ON product_drafts;
DROP TABLE IF EXISTS product_drafts;

-- 8. specs 列默认回 '{}'
ALTER TABLE products ALTER COLUMN specs SET DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 9. 回滚后核对：期望新列与新表全部消失（=0）、CHECK 重新允许 0、
--    010 种子为空、specs 默认回到 {}
-- -----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM information_schema.tables
          WHERE table_name='product_drafts')                                      AS draft_table_left,
       (SELECT count(*) FROM information_schema.columns
          WHERE table_name='products'
            AND column_name IN ('uid','updated_by','published_at'))               AS new_columns_left,
       (SELECT count(*) FROM information_schema.columns
          WHERE table_name='inquiries' AND column_name='product_uid')             AS inquiry_uid_column,
       (SELECT count(*) FROM pg_constraint
          WHERE conname='products_status_check'
            AND pg_get_constraintdef(oid) LIKE '%0%')                             AS check_allows_0,
       (SELECT column_default FROM information_schema.columns
          WHERE table_name='products' AND column_name='specs')                    AS specs_default,
       (SELECT count(*) FROM products WHERE slug LIKE 'example-010-%')            AS online_seed_rows,
       (SELECT count(*) FROM product_categories WHERE slug LIKE 'example-%')      AS seed_categories,
       (SELECT count(*) FROM products WHERE status=0)                             AS offline_online_rows;
