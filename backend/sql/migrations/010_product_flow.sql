-- =============================================================================
-- 010_product_flow.sql · 产品链双表落地（未上线可编辑 / 线上只读）
-- =============================================================================
-- 背景：本脚本此前从未创建也从未执行，products 为 0 行，所以不存在「保留执行记录」
--       的顾虑——上一版口径（只改 specs 默认值 + 种子）连同单表读写一起在此原地改写为
--       与资讯链 012 同构的双表模型：发布后的产品不可编辑、不可删除，唯一动作是下架；
--       下架后可编辑，改完再上架。
--
-- 变更：
--   1. 建 product_drafts（未上线表）：内容列与 products 一一对应，另有 uid / state
--      （0=草稿 / 2=已下架）/ published_at / updated_by；本表是所有内容编辑与删除的唯一落点
--   2. specs 形态归一：列默认 '{}'::jsonb → '[]'::jsonb，存量空对象行改写为合法空列表；
--      同时统计 specs/highlights/gallery 超上限（20/8/8）的行并 NOTICE 输出清单，不自动截断
--   3. products 加 uid（跨表稳定身份）/ updated_by（最后修改人）/ published_at（首次上架时间），
--      updated_by 按 created_by 回填一次（created_by 为空的留 NULL，界面显示占位符不猜人）
--   4. 回收已下架行 + 收窄状态（同一事务）：products.status=0 的整行搬进未上线表置 state=2
--      后删除发布行；同 slug 冲突整笔中止并输出清单（不做静默改名）；
--      随后 CHECK (status IN (0,1)) → CHECK (status = 1)，列默认值同步改为 1
--   5. 纯文本描述包成 <p>：不含任何标签的存量 description 转为受清洗的富文本形态（幂等）
--   6. inquiries 加 product_uid：下架会删线上行、再发布会换主键，线索按内容身份而非行主键追溯；
--      既有 product_id 外键与其 ON DELETE SET NULL 语义不动（product_id 表达「提交时指向哪一行」）
--   7. 验收种子：2 个产品分类 + 4 条产品，覆盖四形态（已上架字段完整 / 已上架仅封面 / 草稿 / 已下架带历史上架时间与自定义排序）
--
-- 执行顺序：本脚本必须先于后端产品端点上线——按草稿行 id 读写的端点、只查发布表的公开接口、
--           `status` 恒为 1 的读法都依赖它。回滚必须与后端回退同批（只回退迁移会让草稿侧端点硬失败）。
-- 说明：幂等，可重复执行。执行：
--         /usr/local/postgres16/bin/psql -d centremix -f backend/sql/migrations/010_product_flow.sql
--       回滚见同目录 010_product_flow.rollback.sql。
--       与 011/012（资讯链）动的是不同表与不同约束，无执行顺序依赖，仅编号连续登记。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 未上线表：product_drafts
--    一行 = 一份「可以编辑、可以删除、可以发布」的内容；官网任何公开接口都不读本表。
--    列名与类型必须与 products 的内容列严格一致，否则第 4 步的整行搬运会静默截断或改形。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_drafts (
  id           BIGSERIAL PRIMARY KEY,
  uid          UUID         NOT NULL DEFAULT gen_random_uuid(), -- 内容身份：跨表搬运不改，本表内唯一
  slug         VARCHAR(120) NOT NULL UNIQUE,                   -- 未上架标识；与 products.slug 跨两表共同判唯一
  name         VARCHAR(160) NOT NULL,
  category_id  BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  series       VARCHAR(80),
  cover_image  TEXT,
  gallery      JSONB        NOT NULL DEFAULT '[]'::jsonb,      -- 图集（可直接渲染的图片地址数组，≤8）
  summary      VARCHAR(400),
  description  TEXT,                                           -- 详细描述（XSS 清洗后的富文本），可为空
  specs        JSONB        NOT NULL DEFAULT '[]'::jsonb,      -- 参数表 {label,value} 有序数组（≤20）
  highlights   JSONB        NOT NULL DEFAULT '[]'::jsonb,      -- 卖点（≤8）
  price_text   VARCHAR(60),
  buy_link     TEXT,
  state        SMALLINT     NOT NULL DEFAULT 0 CHECK (state IN (0,2)), -- 0=草稿 2=已下架；已上架不写本表，故无 1
  sort         INT          NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,                                    -- 随行搬运的首次上架时间：再上架不覆盖；纯草稿为 NULL
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_drafts_uid_key ON product_drafts(uid);
CREATE INDEX IF NOT EXISTS idx_product_drafts_cat ON product_drafts(category_id);
DROP TRIGGER IF EXISTS trg_product_drafts_updated_at ON product_drafts;
CREATE TRIGGER trg_product_drafts_updated_at BEFORE UPDATE ON product_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  product_drafts           IS '产品未上线内容（草稿 + 已下架）：对外不可见，所有内容编辑动作与删除的唯一落点。见 migrations/010_product_flow.sql';
COMMENT ON COLUMN product_drafts.uid       IS '内容身份：与 products.uid 同值随行搬运（发布/下架都不得重新生成），本表内唯一';
COMMENT ON COLUMN product_drafts.slug      IS '未上架标识；与 products.slug 跨两表共同构成唯一性判定（assertProductSlugFree 双向预检）';
COMMENT ON COLUMN product_drafts.state     IS '未上架形态：0=草稿（从未上架）2=已下架（曾上架，整行从 products 搬回）。已上架不写本表，故无 1';
COMMENT ON COLUMN product_drafts.published_at IS '随行搬运的首次上架时间：下架时带下来、再上架不覆盖；纯草稿为 NULL';
COMMENT ON COLUMN product_drafts.updated_by   IS '最后修改人，不是创建人；下架搬运把执行下架的操作人写进本列';
COMMENT ON COLUMN product_drafts.gallery   IS '图集：可直接渲染的图片地址数组（≤8 张），不是 object_key';
COMMENT ON COLUMN product_drafts.specs     IS '规格参数：{label,value} 有序数组（≤20 项），行序即官网展示序';

-- -----------------------------------------------------------------------------
-- 2. specs 形态归一 + 超上限存量行报告
--    官网详情按 [{label,value}] 渲染，而写入侧曾是 z.any()、列默认 '{}'，
--    形态靠前端临时兜。默认值改 '[]'，存量空对象改写为合法空列表（幂等）。
--    超上限的行只报告不截断——截断等于替运营丢内容，交人工确认（见 tasks 10.5）。
-- -----------------------------------------------------------------------------
ALTER TABLE products       ALTER COLUMN specs SET DEFAULT '[]'::jsonb;
ALTER TABLE product_drafts ALTER COLUMN specs SET DEFAULT '[]'::jsonb;

UPDATE products       SET specs = '[]'::jsonb WHERE jsonb_typeof(specs) = 'object';
UPDATE product_drafts SET specs = '[]'::jsonb WHERE jsonb_typeof(specs) = 'object';

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT src, id, slug, len, cap
      FROM (
        SELECT 'products'::text AS src, p.id, p.slug,
               jsonb_array_length(p.specs) AS len, 20 AS cap
          FROM products p WHERE jsonb_typeof(p.specs)='array' AND jsonb_array_length(p.specs) > 20
        UNION ALL
        SELECT 'products', p.id, p.slug, jsonb_array_length(p.gallery), 8
          FROM products p WHERE jsonb_typeof(p.gallery)='array' AND jsonb_array_length(p.gallery) > 8
        UNION ALL
        SELECT 'products', p.id, p.slug, jsonb_array_length(p.highlights), 8
          FROM products p WHERE jsonb_typeof(p.highlights)='array' AND jsonb_array_length(p.highlights) > 8
        UNION ALL
        SELECT 'product_drafts', d.id, d.slug, jsonb_array_length(d.specs), 20
          FROM product_drafts d WHERE jsonb_typeof(d.specs)='array' AND jsonb_array_length(d.specs) > 20
        UNION ALL
        SELECT 'product_drafts', d.id, d.slug, jsonb_array_length(d.gallery), 8
          FROM product_drafts d WHERE jsonb_typeof(d.gallery)='array' AND jsonb_array_length(d.gallery) > 8
        UNION ALL
        SELECT 'product_drafts', d.id, d.slug, jsonb_array_length(d.highlights), 8
          FROM product_drafts d WHERE jsonb_typeof(d.highlights)='array' AND jsonb_array_length(d.highlights) > 8
      ) x
     ORDER BY src, id
  LOOP
    RAISE NOTICE '产品形态超上限（保留原值、不自动截断，请运营确认）：表=% id=% slug=% 长度=% 上限=%',
      r.src, r.id, r.slug, r.len, r.cap;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. products 加列：uid / updated_by / published_at
--    没有 uid 就没有跨表身份：发布与下架都是「删行」动作，行主键一变，
--    审计历史就挂在没人能反查的 id 上。没有 published_at 就没有「首次上架时间」可言。
-- -----------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS uid          UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by   BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS products_uid_key ON products(uid);

UPDATE products SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL;

COMMENT ON TABLE  products         IS '产品发布表（线上内容）：只放正在上架的产品，一行 = 一份线上内容。改写它的只有三个动作——发布（整行搬入）、下架（整行搬回 product_drafts）、调整列表排序值';
COMMENT ON COLUMN products.uid     IS '内容身份：跨表搬运不改，本表内唯一；审计 entity_id 记本列而非行 id';
COMMENT ON COLUMN products.updated_by IS '最后修改人，不是创建人（created_by 另列并存）；每条写入路径刷新为当次操作人';
COMMENT ON COLUMN products.published_at IS '首次上架时间：发布时写入一次，之后的再上架都不覆盖；随下架搬运随行保留';
COMMENT ON COLUMN products.status  IS '恒 1，只作「这行是否在线」的存在性证明；已下架状态见 product_drafts.state';
COMMENT ON COLUMN products.gallery IS '图集：可直接渲染的图片地址数组（≤8 张），不是 object_key';
COMMENT ON COLUMN products.specs   IS '规格参数：{label,value} 有序数组（≤20 项），行序即官网展示序';
COMMENT ON COLUMN products.sort    IS '列表排序值：线上行唯一可写列，只由 POST /products/:id/sort 改写（见 design D6）';

-- -----------------------------------------------------------------------------
-- 4. 回收已下架行 + 收窄发布表状态（同一事务）
--    先搬后改约束，避免出现「CHECK 已收到 1 但 status=0 的行还在表里」的中间态。
--    本地库 products 为 0 行，这一步是空搬移，但脚本必须写出来：别的环境可能有历史下架行。
-- -----------------------------------------------------------------------------
BEGIN;

-- 冲突预检在事务内：RAISE 让整笔回滚，同标识的草稿行与下架行都保持原样，
-- 人工处理后重跑本脚本即可（不做静默改名——改名等于悄悄改掉官网地址）
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(p.slug, ', ' ORDER BY p.slug) INTO conflicts
    FROM products p JOIN product_drafts d ON d.slug = p.slug
   WHERE p.status = 0;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '已下架行回收中止：未上线表已存在同标识行（%），请先处理后重跑本脚本（不做静默改名）', conflicts;
  END IF;
END $$;

-- 整行搬运：uid / sort / published_at / created_* / updated_* 逐列写出，
-- MUST NOT 用 SELECT *（列序一变就搬错），也 MUST NOT 让 uid 走列默认值重新生成
INSERT INTO product_drafts
  (slug, name, category_id, series, cover_image, gallery, summary, description,
   specs, highlights, price_text, buy_link, uid, state, sort, published_at,
   created_by, updated_by, created_at, updated_at)
SELECT p.slug, p.name, p.category_id, p.series, p.cover_image, p.gallery, p.summary, p.description,
       p.specs, p.highlights, p.price_text, p.buy_link, p.uid, 2, p.sort, p.published_at,
       p.created_by, p.updated_by, p.created_at, p.updated_at
  FROM products p
 WHERE p.status = 0;

DELETE FROM products WHERE status = 0;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD  CONSTRAINT products_status_check CHECK (status = 1);
ALTER TABLE products ALTER COLUMN status SET DEFAULT 1;

COMMIT;

-- -----------------------------------------------------------------------------
-- 5. 纯文本描述转为受清洗的富文本形态
--    幂等判定为「原值不含 <」：已含标签的行不再处理，避免二次包裹。
--    只加一层 <p>，不做任何格式化——编辑器打开看到的是原文落进段落里。
-- -----------------------------------------------------------------------------
UPDATE products
   SET description = '<p>' || replace(description, '&', '&amp;') || '</p>'
 WHERE description IS NOT NULL AND description <> '' AND description NOT LIKE '%<%';

UPDATE product_drafts
   SET description = '<p>' || replace(description, '&', '&amp;') || '</p>'
 WHERE description IS NOT NULL AND description <> '' AND description NOT LIKE '%<%';

-- -----------------------------------------------------------------------------
-- 6. inquiries.product_uid：线索按内容身份追溯产品
--    下架删线上行会把 product_id 置空（ON DELETE SET NULL），再发布还会换主键，
--    所以行主键不是可靠追溯线。ADD COLUMN ... NULL 无默认值，不重写表。
-- -----------------------------------------------------------------------------
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS product_uid UUID NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_product_uid ON inquiries(product_uid);

UPDATE inquiries i
   SET product_uid = p.uid
  FROM products p
 WHERE i.product_id = p.id
   AND i.product_uid IS NULL
   AND p.uid IS NOT NULL;

COMMENT ON COLUMN inquiries.product_id  IS '提交询价时指向的线上行主键；产品下架后会被外键置空，这是双表模型接受的既成事实，追溯请用 product_uid';
COMMENT ON COLUMN inquiries.product_uid IS '提交询价时那条产品的内容身份：跨表搬运与重新发布都不变，线索列表据此解析产品当前名称与标识';

-- -----------------------------------------------------------------------------
-- 7. 验收种子（四形态）
--    描述只使用富文本能力边界内的标签与属性（h2/h3/h4、p、strong/em、ul/ol/li、
--    img[src|alt|width|height|loading]），因此种子行本身就是
--    「编辑器产出 = 清洗后保留 = 官网渲染」三者一致的回归样本。
--    图片引用现有内置资产 public/website/img/prod/*.png，正式素材由运营替换。
--    按固定 uid + 标识双重判存，重复执行不产生第二份；名称与摘要冠「示例」。
-- -----------------------------------------------------------------------------

-- 7.1 两个分类（名称冠「示例」，避免与运营正式分类混淆）
INSERT INTO product_categories (name, slug, description, parent_id, sort)
SELECT '示例：企业级存储盘', 'example-enterprise-hdd', '迁移 010 种入的验收分类，正式素材由运营替换。', NULL, 1
 WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE slug = 'example-enterprise-hdd');

INSERT INTO product_categories (name, slug, description, parent_id, sort)
SELECT '示例：消费级内存条', 'example-consumer-ddr', '迁移 010 种入的验收分类，正式素材由运营替换。', NULL, 2
 WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE slug = 'example-consumer-ddr');

-- 7.2 形态「已上架、字段完整」：规格 3 项 / 卖点 2 条 / 图集 2 张 / 价格文案 / 购买链接 / 富文本描述
--     用来验收详情页逐字段一致，特别是分类名由接口真实下发（不出现写死的「存储产品」）
INSERT INTO products (uid, slug, name, category_id, series, cover_image, gallery, summary, description,
                      specs, highlights, price_text, buy_link, status, sort, published_at, created_by)
SELECT '00000000-0000-4000-8000-000000000101'::uuid, 'example-010-full',
       '示例 010：字段完整的产品（已上架）',
       (SELECT id FROM product_categories WHERE slug = 'example-enterprise-hdd'),
       'Exos 示例系列', '/website/img/prod/cube-closeup.png',
       jsonb_build_array('/website/img/prod/cube-closeup.png', '/website/img/prod/scene-hero.png'),
       '字段齐备的样例：规格、卖点、图集、价格文案与购买链接都有，详情区逐块都应渲染。',
       '<h2>示例详情：字段完整</h2>'
       || '<p>本条由迁移 010 种入，<strong>用于链路验收</strong>，正式素材由运营替换。</p>'
       || '<img src="/website/img/prod/lifestyle-1.png" alt="示例配图：桌面场景" width="1200" height="675" loading="lazy">'
       || '<h3>本条用来验收</h3>'
       || '<ol><li>规格表按录入顺序渲染 3 行</li><li>卖点区渲染 2 条</li>'
       || '<li>图集可切换 2 张，不回落内置占位图</li>'
       || '<li>分类名与后台录入逐字一致</li></ol>',
       jsonb_build_array(jsonb_build_object('label','容量','value','20 TB'),
                         jsonb_build_object('label','接口','value','SATA 6 Gb/s'),
                         jsonb_build_object('label','转速','value','7200 RPM')),
       jsonb_build_array('示例卖点甲：长期稳定读写', '示例卖点乙：企业级 5 年质保'),
       '￥ 询价', 'https://example.com/purchase/demo', 1, 1,
       NOW() - INTERVAL '2 days', NULL
 WHERE NOT EXISTS (SELECT 1 FROM products WHERE uid = '00000000-0000-4000-8000-000000000101'::uuid)
   AND NOT EXISTS (SELECT 1 FROM products WHERE slug = 'example-010-full')
   AND NOT EXISTS (SELECT 1 FROM product_drafts WHERE slug = 'example-010-full');

-- 7.3 形态「已上架、仅封面」：图集/规格/卖点/描述/价格/购买链接全空
--     专门验收「无数据即不渲染」与「描述为空也能上架」
INSERT INTO products (uid, slug, name, category_id, series, cover_image, gallery, summary, description,
                      specs, highlights, price_text, buy_link, status, sort, published_at, created_by)
SELECT '00000000-0000-4000-8000-000000000102'::uuid, 'example-010-cover-only',
       '示例 010：只有封面的产品（已上架）',
       (SELECT id FROM product_categories WHERE slug = 'example-consumer-ddr'),
       NULL, '/website/img/prod/mem-box.png',
       '[]'::jsonb,
       '只有封面与摘要的样例：图集、规格、卖点与描述都留空，用来验收空数据不渲染成空壳。',
       NULL, '[]'::jsonb, '[]'::jsonb, NULL, NULL, 1, 2,
       NOW() - INTERVAL '1 day', NULL
 WHERE NOT EXISTS (SELECT 1 FROM products WHERE uid = '00000000-0000-4000-8000-000000000102'::uuid)
   AND NOT EXISTS (SELECT 1 FROM products WHERE slug = 'example-010-cover-only')
   AND NOT EXISTS (SELECT 1 FROM product_drafts WHERE slug = 'example-010-cover-only');

-- 7.4 形态「草稿」：state=0、无分类无价格、从未上架
INSERT INTO product_drafts (uid, slug, name, category_id, series, cover_image, gallery, summary, description,
                            specs, highlights, price_text, buy_link, state, sort, published_at, created_by)
SELECT '00000000-0000-4000-8000-000000000103'::uuid, 'example-010-draft',
       '示例 010：草稿产品（未上架）',
       NULL, NULL, NULL, '[]'::jsonb,
       '从未上架的草稿：发布表里没有它的行，官网列表、站内搜索与详情地址都取不到。',
       '<p>这条内容只在未上线表有一行，<code>state=0</code>，分类与价格都还没填。</p>',
       '[]'::jsonb, '[]'::jsonb, NULL, NULL, 0, 0, NULL, NULL
 WHERE NOT EXISTS (SELECT 1 FROM product_drafts WHERE uid = '00000000-0000-4000-8000-000000000103'::uuid)
   AND NOT EXISTS (SELECT 1 FROM product_drafts WHERE slug = 'example-010-draft')
   AND NOT EXISTS (SELECT 1 FROM products WHERE slug = 'example-010-draft');

-- 7.5 形态「已下架」：state=2、带历史上架时间与自定义排序值
--     专门验收「下架后内容仍在、可编辑、可重新发布且上架时间与排序延续」
INSERT INTO product_drafts (uid, slug, name, category_id, series, cover_image, gallery, summary, description,
                            specs, highlights, price_text, buy_link, state, sort, published_at, created_by)
SELECT '00000000-0000-4000-8000-000000000104'::uuid, 'example-010-offline',
       '示例 010：已下架产品（可编辑、可再上架）',
       (SELECT id FROM product_categories WHERE slug = 'example-enterprise-hdd'),
       'BarraCuda 示例系列', '/website/img/prod/lifestyle-2.png',
       jsonb_build_array('/website/img/prod/lifestyle-2.png'),
       '已下架的样例：整行从发布表搬回未上线表并标 state=2，历史上架时间与排序值随行保留。',
       '<p>这条产品曾上架，下架后编辑与删除入口都可用；重新上架后 <code>published_at</code> 仍是历史值、<code>sort</code> 仍是 9。</p>',
       jsonb_build_array(jsonb_build_object('label','容量','value','4 TB'),
                         jsonb_build_object('label','接口','value','SATA 6 Gb/s')),
       jsonb_build_array('示例卖点：已下架内容不丢'),
       NULL, NULL, 2, 9,
       NOW() - INTERVAL '30 days', NULL
 WHERE NOT EXISTS (SELECT 1 FROM product_drafts WHERE uid = '00000000-0000-4000-8000-000000000104'::uuid)
   AND NOT EXISTS (SELECT 1 FROM product_drafts WHERE slug = 'example-010-offline')
   AND NOT EXISTS (SELECT 1 FROM products WHERE slug = 'example-010-offline');

-- -----------------------------------------------------------------------------
-- 8. 执行后核对（期望：发布表无非 1 状态行 / 两表 uid 各自不重复 / state 只有 0|2 /
--    specs 无对象形态残留 / 已下架种子带历史上架时间与排序 / product_uid 列与索引就位）
--    全部用标量子查询，避免聚合列与 EXISTS 子链接在 UNION 分支里读出歧义值
-- -----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM products WHERE status <> 1)                          AS bad_status_rows,
       (SELECT count(*) FROM products WHERE uid IS NULL)                           AS online_uid_missing,
       (SELECT count(*) FROM (SELECT uid FROM products GROUP BY uid HAVING count(*)>1) x)              AS online_dup_uid,
       (SELECT count(*) FROM (SELECT uid FROM product_drafts GROUP BY uid HAVING count(*)>1) y)        AS draft_dup_uid,
       (SELECT count(*) FROM (SELECT slug FROM (SELECT slug FROM products
                                                UNION ALL SELECT slug FROM product_drafts) s
                              GROUP BY slug HAVING count(*)>1) z)                 AS cross_dup_slug,
       (SELECT count(*) FROM product_drafts WHERE state NOT IN (0,2))              AS bad_state_rows,
       (SELECT count(*) FROM products WHERE jsonb_typeof(specs)='object')          AS online_object_specs,
       (SELECT count(*) FROM product_drafts WHERE jsonb_typeof(specs)='object')    AS draft_object_specs,
       (SELECT count(*) FROM pg_constraint
          WHERE conname='products_status_check'
            AND pg_get_constraintdef(oid) LIKE '%(status = 1)%')                   AS narrowed_status_check,
       (SELECT count(*) FROM information_schema.columns
          WHERE table_name='inquiries' AND column_name='product_uid')              AS inquiry_uid_column,
       (SELECT count(*) FROM pg_indexes WHERE indexname='idx_inquiries_product_uid') AS inquiry_uid_index,
       (SELECT count(*) FROM product_drafts WHERE state=2 AND published_at IS NOT NULL AND sort=9) AS offline_seed_ok,
       (SELECT count(*) FROM products WHERE slug LIKE 'example-010-%')             AS online_seed_rows,
       (SELECT count(*) FROM product_drafts WHERE slug LIKE 'example-010-%')       AS draft_seed_rows,
       (SELECT count(*) FROM product_categories WHERE slug LIKE 'example-%')       AS seed_categories;
