-- =============================================================================
-- 011_article_flow.sql · 资讯链双表地基
-- =============================================================================
-- 背景：资讯的「线上内容」与「未发布内容」原先压在 articles 的同一份列里，
--       PATCH 直接覆盖 body，半成品实时上线；同时 DELETE /articles/:id 是裸删除，
--       浏览去重明细若只写 article_id 会留下指向不存在 id 的孤儿行。
--       本迁移把两件事交给数据库结构本身，而不是每个读写点的自觉：
--         · 未发布内容独立成表 article_drafts，编辑动作拿不到发布行的写入口
--         · 引用关系带 ON DELETE CASCADE，删线上行时副本与浏览明细一并清理
--
-- 变更：
--   1. 建 article_drafts（可编辑列与 articles 一一对应）+ published_id 外键与唯一约束
--   2. 存量 status=0 行整行搬入 article_drafts 后从 articles 删除，并把 articles.status
--      的 CHECK 收窄为 (1,2)——草稿在发布表没有行，状态 0 对它已无意义
--   3. 建 article_view_dedupe（浏览判重明细，带级联）+ 索引 + 按周清理
--   4. 幂等种入 2 个资讯分类与 4 条内容，覆盖四种形态，作为端到端验收与回归样本
--
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 011_article_flow.sql
--       回滚见同目录 011_article_flow.rollback.sql（必须先回滚后端再回滚本脚本，
--       否则按草稿 id 的端点会因表不存在而失败）。
--       与 010_product_flow.sql（产品链）无执行顺序依赖：动的是不同表与不同约束，仅编号连续登记。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 草稿表 article_drafts：所有编辑动作的唯一落点
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_drafts (
  id           BIGSERIAL PRIMARY KEY,
  slug         VARCHAR(100) NOT NULL UNIQUE,
  title        VARCHAR(200) NOT NULL,
  cover_image  TEXT,
  summary      VARCHAR(400),
  body         TEXT,
  category_id  BIGINT REFERENCES article_categories(id) ON DELETE SET NULL,
  tags         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  author       VARCHAR(50),
  -- 一条线上内容最多一份待发布副本；删线上行时副本随之消失（断点 ④ 的方向之一）
  published_id BIGINT REFERENCES articles(id) ON DELETE CASCADE,
  created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS article_drafts_published_id_key ON article_drafts(published_id);
CREATE INDEX IF NOT EXISTS idx_article_drafts_cat ON article_drafts(category_id);
DROP TRIGGER IF EXISTS trg_article_drafts_updated_at ON article_drafts;
CREATE TRIGGER trg_article_drafts_updated_at BEFORE UPDATE ON article_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  article_drafts IS '资讯未发布内容（草稿与待发布副本）：本表内容对外不可见，官网任何公开接口都不读取本表';
COMMENT ON COLUMN article_drafts.body IS '未发布正文，对外不可见；服务端清洗后仍保留在此列，发布才覆盖 articles.body';
COMMENT ON COLUMN article_drafts.slug IS '未发布标识，对外不可见；与 articles.slug 跨两表共同构成唯一性判定';
COMMENT ON COLUMN article_drafts.published_id IS '指向其线上内容：非空=已发布/已下线条目的待发布副本，为空=从未发布的纯草稿';
COMMENT ON COLUMN article_drafts.author IS '未发布作者，对外不可见';
COMMENT ON COLUMN article_drafts.category_id IS '未发布归属分类，对外不可见；分类删除的引用计数需与本表一并统计';

-- -----------------------------------------------------------------------------
-- 2. 发布表 articles：状态收窄，草稿搬离
--    搬移与约束变更同事务，避免出现「有草稿行但 CHECK 还不允许」的中间态
-- -----------------------------------------------------------------------------
BEGIN;

INSERT INTO article_drafts
  (slug, title, cover_image, summary, body, category_id, tags, author, published_id, created_by, created_at, updated_at)
SELECT a.slug, a.title, a.cover_image, a.summary, a.body, a.category_id, a.tags, a.author, NULL, a.created_by, a.created_at, a.updated_at
  FROM articles a WHERE a.status = 0
  -- 同标识的草稿行已存在时保留既有草稿：重复执行本脚本不会把线上内容倒灌回草稿表
ON CONFLICT (slug) DO NOTHING;

DELETE FROM articles WHERE status = 0;

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD CONSTRAINT articles_status_check CHECK (status IN (1,2));

COMMIT;

-- status=2（已下线）留在发布表：「下线是状态不是位置」，重新上线不需要搬数据
COMMENT ON TABLE  articles IS '资讯线上内容（发布表）：本表内容对外可见，只有发布、下线、删除三种动作能改写它';
COMMENT ON COLUMN articles.status IS '线上状态：1=已发布 2=已下线。草稿不在本表（见 article_drafts），故取值不含 0';
COMMENT ON COLUMN articles.body IS '线上正文，对外可见；只由发布动作从 article_drafts.body 覆盖，编辑动作写不到这里';
COMMENT ON COLUMN articles.slug IS '线上标识，决定官网详情地址 /article/{slug}；唯一性需与 article_drafts.slug 一并判定';
COMMENT ON COLUMN articles.view_count IS '线上浏览计数，对外可见；发布覆盖清单不含本列，修订发布不清零';

-- -----------------------------------------------------------------------------
-- 3. 浏览判重明细 article_view_dedupe
--    没有 FK 则删资讯后明细留孤儿行并继续被写入；只加 FK 不加 CASCADE
--    则「删除一篇被人看过的资讯」报 500 —— 两个方向都在 DDL 里定死
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_view_dedupe (
  id          BIGSERIAL PRIMARY KEY,
  article_id  BIGINT       NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  visitor_key VARCHAR(64)  NOT NULL,
  seen_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_article_view_dedupe_window
  ON article_view_dedupe(article_id, visitor_key, seen_at);

COMMENT ON TABLE article_view_dedupe IS '资讯浏览判重明细：同一访客 24 小时内重复访问不计数；仅服务发布表的 view_count，本表内容对外不可见';

-- 按周清理：明细只需覆盖判重窗口，长期保留会随流量无限增长。可重复执行
DELETE FROM article_view_dedupe WHERE seen_at < NOW() - INTERVAL '7 days';

-- -----------------------------------------------------------------------------
-- 4. 四形态验收种子
--    正文只使用富文本能力边界内的标签与属性（h2/h3/h4、p、strong/em/u/s、code、
--    pre、ul/ol/li、blockquote、hr、a[href|target|rel]、img[src|alt|width|height|loading]），
--    因此种子行本身就是「编辑器产出 = 清洗后保留 = 官网渲染」三者一致的回归样本。
--    图片引用现有内置资产 public/website/img/prod/*.png，正式素材由运营替换。
-- -----------------------------------------------------------------------------

-- 4.1 资讯分类 2 个
INSERT INTO article_categories (name, slug, description, sort)
SELECT '品牌动态', 'news', '新闻时讯', 0
 WHERE NOT EXISTS (SELECT 1 FROM article_categories WHERE slug = 'news');
INSERT INTO article_categories (name, slug, description, sort)
SELECT '公司要闻', 'buiness', '公司新闻', 1
 WHERE NOT EXISTS (SELECT 1 FROM article_categories WHERE slug = 'buiness');

-- 4.2 形态 ①：已发布，正文带图与有序列表（只有发布行）
INSERT INTO articles (slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by)
SELECT 'example-brand-launch', '示例：Centremix 品牌动态上线', '/website/img/prod/scene-hero.png',
       '用于官网资讯列表与详情渲染验收的示例内容，覆盖正文配图、有序列表与引用块。',
       '<h2>示例正文：链路验收用</h2>'
       || '<p>本条资讯由迁移 011 种入，<strong>用于链路验收</strong>，正式素材由运营替换。它带一张站内配图与一个有序列表，'
       || '用来核对「编辑器产出 = 清洗后保留 = 官网渲染」三者一致。</p>'
       || '<img src="/website/img/prod/lifestyle-1.png" alt="示例配图：桌面收纳场景" width="1200" height="675" loading="lazy">'
       || '<h3>这条样例覆盖的验收点</h3>'
       || '<ol><li>列表按发布时间倒序，详情走 <code>/article/example-brand-launch</code></li>'
       || '<li>正文图片宽度自适应，不超出容器</li>'
       || '<li>元信息区的作者、分类、发布时间、浏览量按存在与否渲染</li></ol>'
       || '<blockquote>已发布形态：线上内容只由发布动作改写，编辑动作拿不到它的写入口。</blockquote>',
       (SELECT id FROM article_categories WHERE slug = 'news'),
       jsonb_build_array('示例', '品牌动态'), '内容示例组', 1,
       NOW() - INTERVAL '21 days', 8, NULL
 WHERE NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-brand-launch')
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-brand-launch');

-- 4.3 形态 ④：已下线（发布行 status=2，留在发布表且不可原地编辑）
INSERT INTO articles (slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by)
SELECT 'example-offline-notice', '示例：已下线资讯不在官网出现', '/website/img/prod/cube-closeup.png',
       '用于验收「下线后从列表、搜索、相关资讯推荐中消失，直访详情得到品牌化 404 且不再累加计数」。',
       '<h2>示例正文：已下线形态</h2>'
       || '<p>这条资讯的状态是 <strong>2（已下线）</strong>，内容仍留在发布表中。它的验收点：</p>'
       || '<ul><li>官网列表与站内搜索不再出现它</li>'
       || '<li>直接访问详情地址呈现品牌化 404</li>'
       || '<li>反复访问不会让浏览量增长</li></ul>'
       || '<p>对它发起修订走与已发布完全相同的路径：建副本 → 编辑副本 → 发布覆盖并把状态拉回 1。</p>',
       (SELECT id FROM article_categories WHERE slug = 'buiness'),
       jsonb_build_array('示例', '已下线'), '内容示例组', 2,
       NOW() - INTERVAL '40 days', 0, NULL
 WHERE NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-offline-notice')
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-offline-notice');

-- 4.4 形态 ②：已发布且挂一份待发布副本（发布行 + 副本行，闭合断点 ①）
INSERT INTO articles (slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by)
SELECT 'example-storage-insight', '示例：便捷存储趋势（线上版本）', '/website/img/prod/mem-box.png',
       '线上版本正文。它同时挂着一份未发布的改动，用来验收「编辑期间线上不变」与「重开编辑页仍是我的改动」。',
       '<h2>线上版本：便捷存储三点观察</h2>'
       || '<p>官网此刻呈现的是这一版正文。下面的段落会在副本改动被发布后被覆盖。</p>'
       || '<ul><li>移动创作场景更看重即插即用</li>'
       || '<li>家庭归档从「容量优先」转向「整理优先」</li>'
       || '<li>多设备同步把备份变成日常动作</li></ul>'
       || '<p><em>本条由迁移 011 种入，正式素材由运营替换。</em></p>',
       (SELECT id FROM article_categories WHERE slug = 'news'),
       jsonb_build_array('示例', '存储趋势'), '内容示例组', 1,
       NOW() - INTERVAL '9 days', 0, NULL
 WHERE NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-storage-insight')
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-storage-insight');

-- 副本行：与发布行同标识，正文多出一段待发布内容；标识一致，故「待生效」不产生新地址
INSERT INTO article_drafts (slug, title, cover_image, summary, body, category_id, tags, author, published_id, created_by)
SELECT 'example-storage-insight', '示例：便捷存储趋势（线上版本）', '/website/img/prod/mem-box.png',
       '线上版本正文。它同时挂着一份未发布的改动，用来验收「编辑期间线上不变」与「重开编辑页仍是我的改动」。',
       '<h2>线上版本：便捷存储三点观察</h2>'
       || '<p>官网此刻呈现的是这一版正文。下面的段落会在副本改动被发布后被覆盖。</p>'
       || '<ul><li>移动创作场景更看重即插即用</li>'
       || '<li>家庭归档从「容量优先」转向「整理优先」</li>'
       || '<li>多设备同步把备份变成日常动作</li></ul>'
       || '<h3>待发布改动：这一节线上还看不到</h3>'
       || '<p>本段只存在于草稿表的副本行里。重开编辑页 SHOULD 看到它，官网详情 MUST NOT 看到它。</p>'
       || '<hr />'
       || '<p><em>本条由迁移 011 种入，正式素材由运营替换。</em></p>',
       (SELECT id FROM article_categories WHERE slug = 'news'),
       jsonb_build_array('示例', '存储趋势'), '内容示例组', a.id, NULL
  FROM articles a
 WHERE a.slug = 'example-storage-insight'
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE published_id = a.id);

-- 4.5 形态 ③：纯草稿（只有草稿行、无作者无分类，published_id 为空 → 彻底未发布）
INSERT INTO article_drafts (slug, title, cover_image, summary, body, category_id, tags, author, published_id, created_by)
SELECT 'example-draft-only', '示例：纯草稿不应出现在官网任何位置', NULL,
       '从未发布过的草稿：没有线上内容行，官网列表、搜索、详情地址都取不到它。',
       '<h2>草稿正文</h2>'
       || '<p>这条内容只在草稿表里有一行，<code>published_id</code> 为空，分类与作者都还没填。'
       || '它用来验收「未发布内容不可经地址访问，其标题与摘要不得泄漏」。</p>'
       || '<p>发布后会新建发布行、写入发布时间，本行随即消失。</p>',
       NULL, jsonb_build_array('示例'), NULL, NULL, NULL
 WHERE NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-draft-only')
   AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-draft-only');

-- -----------------------------------------------------------------------------
-- 5. 执行后核对（期望：status 只剩 1/2；副本行 1、纯草稿行 1；去重表 0 行但索引与外键都在）
--    全部用标量子查询，避免聚合列与 EXISTS 子链接混在 UNION 分支里读出歧义值
-- -----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM articles WHERE status NOT IN (1,2))          AS bad_status_rows,
       (SELECT count(*) FROM articles WHERE slug LIKE 'example-%')        AS seed_rows,
       (SELECT count(*) FROM article_drafts WHERE published_id IS NOT NULL) AS copy_rows,
       (SELECT count(*) FROM article_drafts WHERE published_id IS NULL)   AS pure_draft_rows,
       (SELECT count(*) FROM article_view_dedupe)                         AS dedupe_rows,
       (SELECT count(*) FROM pg_indexes WHERE indexname IN
          ('idx_article_view_dedupe_window','article_drafts_published_id_key')) AS new_indexes,
       (SELECT count(*) FROM pg_constraint WHERE conname IN
          ('article_drafts_published_id_fkey','article_view_dedupe_article_id_fkey')) AS cascade_fks;
