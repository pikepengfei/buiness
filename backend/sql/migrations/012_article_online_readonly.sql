-- =============================================================================
-- 012_article_online_readonly.sql · 资讯线上只读修订
-- =============================================================================
-- 背景：011 那版是「下线是状态不是位置 + 副本行表示未发布改动」。本轮按需求方
--       新口径改写为「一条资讯同一时刻只存在于一张表，线上内容只读且不可删除，
--       唯一动作是下线」，并新增「修改人 + 可按内容身份串联的改动记录」。
--       011 已执行且是全量走查记录的依据，本脚本只在其库形之上改写，不回改 011。
--
-- 变更：
--   1. 两表各加 uid（跨表稳定身份）与 updated_by（最后修改人）；草稿表加 state
--      （0=草稿 / 2=已下线），并补齐搬运需要的 view_count / published_at 两列
--   2. 灌存量修改人：updated_by = created_by（created_by 为空的留 NULL，界面显示占位符）
--   3. 回收已下线行：articles.status=2 的整行搬进草稿表置 state=2，同事务删除发布行；
--      草稿表已有同 slug 行时整笔中止并输出冲突清单（不做静默改名）
--   4. 撤除副本机制：旧副本行降级为 state=0 的普通草稿（内容与标识原样保留、不改名），
--      随后 DROP COLUMN published_id（连带其唯一索引与 ON DELETE CASCADE 外键）
--   5. 收窄发布表状态：CHECK (status IN (1,2)) → CHECK (status = 1)，与第 3 步同事务；
--      status 的列默认值一并改为 1，否则「插入时不写 status」会撞上收窄后的 CHECK
--   6. 重排验收种子为三形态（已上线两条、草稿一条、已下线一条且带非零浏览量与历史发布时间）
--
-- 执行顺序：011 → 012。后端必须与本迁移同批发布/同批回退——按草稿 id 读写的端点与
--           列表字段都依赖 state/uid，只回退其一会让管理面硬失败。
-- 说明：幂等，可重复执行。执行：psql -d centremix -f 012_article_online_readonly.sql
--       回滚见同目录 012_article_online_readonly.rollback.sql。
--       与 010_product_flow.sql（产品链）仍无执行顺序依赖，仅编号连续登记。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 新列：内容身份 uid / 最后修改人 updated_by / 草稿表 state
-- -----------------------------------------------------------------------------
-- uid 让「一条内容在两表之间搬运」不断线：slug 可改、id 随表换、uid 恒定，
-- 审计记录据此归属（见 design D13）。搬运 MUST NOT 让它走默认值重新生成。
ALTER TABLE articles      ADD COLUMN IF NOT EXISTS uid UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS uid UUID NOT NULL DEFAULT gen_random_uuid();
-- 各表内唯一：同一条内容不可能在同一张表里出现两行
CREATE UNIQUE INDEX IF NOT EXISTS articles_uid_key       ON articles(uid);
CREATE UNIQUE INDEX IF NOT EXISTS article_drafts_uid_key ON article_drafts(uid);

-- updated_by 是「最后修改人」，与 created_by（创建人）并列，不改对外署名 author
ALTER TABLE articles       ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;

-- state 只区分草稿与已下线两种未发布形态；已上线不写进草稿表，故取值不含 1
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS state SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE article_drafts DROP CONSTRAINT IF EXISTS article_drafts_state_check;
ALTER TABLE article_drafts ADD  CONSTRAINT article_drafts_state_check CHECK (state IN (0,2));

-- 搬运需要：下线把浏览量与首次发布时间带回草稿表，发布再原样搬回去。
-- 011 建表时线上侧从不搬运，草稿表因此没有这两列；本轮「下线即换表」必须先补列
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS view_count   INT NOT NULL DEFAULT 0;
ALTER TABLE article_drafts ADD COLUMN IF NOT EXISTS published_at  TIMESTAMPTZ;

COMMENT ON COLUMN articles.uid           IS '内容身份：跨表搬运与被删重建都不变，本表内唯一；审计 entity_id 记本列而非行 id';
COMMENT ON COLUMN article_drafts.uid     IS '内容身份：与 articles.uid 同值随行搬运（发布/下线都不得重新生成），本表内唯一';
COMMENT ON COLUMN articles.updated_by    IS '最后修改人，不是创建人（created_by 另列并存）；每次写入路径刷新为当次操作人';
COMMENT ON COLUMN article_drafts.updated_by IS '最后修改人，不是创建人；下线搬运把执行下线的操作人写进本列';
COMMENT ON COLUMN article_drafts.state   IS '未发布形态：0=草稿（从未上线）2=已下线（曾上线，整行从 articles 搬回）。已上线不写本表，故无 1';
COMMENT ON COLUMN article_drafts.view_count IS '随行搬运的浏览计数：下线时带下来、发布时搬回去，不因换表清零，是本列存在的唯一理由';
COMMENT ON COLUMN article_drafts.published_at IS '随行搬运的首次发布时间：下线时带下来、再发布不覆盖；纯草稿为 NULL';

-- -----------------------------------------------------------------------------
-- 2. 灌存量修改人
--    只按 created_by 回填一次（WHERE updated_by IS NULL），后续每个写路径各自刷新；
--    created_by 为空的行留 NULL —— 界面显示占位符，不猜一个人
-- -----------------------------------------------------------------------------
UPDATE articles       SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL;
UPDATE article_drafts SET updated_by = created_by WHERE updated_by IS NULL AND created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3 + 5. 回收已下线行 + 收窄发布表状态（同一事务）
--        先搬后改约束，避免出现「CHECK 已收到 1 但 status=2 的行还在表里」的中间态
-- -----------------------------------------------------------------------------
BEGIN;

-- 冲突预检放在事务内：RAISE 会让整笔事务回滚，同标识的草稿行与下线行都保持原样，
-- 由人工处理后再重跑本脚本（幂等），不做静默改名
DO $$
DECLARE conflicts text;
BEGIN
  SELECT string_agg(a.slug, ', ' ORDER BY a.slug) INTO conflicts
    FROM articles a JOIN article_drafts d ON d.slug = a.slug
   WHERE a.status = 2;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '下线行回收中止：草稿表已存在同标识行（%），请先处理后重跑本脚本（不做静默改名）', conflicts;
  END IF;
END $$;

-- 整行搬运：uid / view_count / published_at / created_* / updated_* 逐列写出，
-- MUST NOT 用 SELECT *（列序一变就搬错），也 MUST NOT 让 uid 走默认值重新生成
INSERT INTO article_drafts
  (slug, title, cover_image, summary, body, category_id, tags, author,
   uid, state, view_count, published_at, created_by, updated_by, created_at, updated_at)
SELECT a.slug, a.title, a.cover_image, a.summary, a.body, a.category_id, a.tags, a.author,
       a.uid, 2, a.view_count, a.published_at, a.created_by, a.updated_by, a.created_at, a.updated_at
  FROM articles a
 WHERE a.status = 2;

DELETE FROM articles WHERE status = 2;

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD  CONSTRAINT articles_status_check CHECK (status = 1);

COMMIT;

COMMENT ON COLUMN articles.status IS '恒 1，只作已上线标记：本表只放正在上线的行，下线状态移交 article_drafts.state=2（草稿在 011 已搬离本表，故取值不含 0）';
ALTER TABLE articles ALTER COLUMN status SET DEFAULT 1;
COMMENT ON TABLE  articles IS '资讯线上内容（发布表）：只放正在上线的条目，对外可见且只读——只有发布（新行落表）与下线（整行搬走）两个动作能改写它';

-- -----------------------------------------------------------------------------
-- 4. 撤除副本机制
--    旧「未发布改动」副本行在新模型里不该存在：降级为一条普通草稿，内容、标识都不动，
--    它与原线上行同标识的冲突交由应用层的跨表预检在下次保存时提示改名
-- -----------------------------------------------------------------------------
UPDATE article_drafts SET state = 0 WHERE published_id IS NOT NULL AND state <> 0;

DO $$
DECLARE demoted text;
BEGIN
  SELECT string_agg(slug || '(id=' || id || ')', ', ' ORDER BY id) INTO demoted
    FROM article_drafts WHERE published_id IS NOT NULL;
  RAISE NOTICE '012 因撤除副本机制而降级的草稿清单：%（无则为空）', COALESCE(demoted, '无');
END $$;

-- 连带去掉 UNIQUE(published_id) 索引与那条 ON DELETE CASCADE 外键（随列消失）
ALTER TABLE article_drafts DROP COLUMN IF EXISTS published_id;

COMMENT ON COLUMN article_drafts.slug IS '未发布标识；与 articles.slug 跨两表共同构成唯一性判定（assertSlugFree 双向预检）';

-- -----------------------------------------------------------------------------
-- 5. 重排验收种子（三形态）
--    正文只使用富文本能力边界内的标签与属性（h2/h3/h4、p、strong/em/u/s、code、
--    pre、ul/ol/li、blockquote、hr、a[href|target|rel]、img[src|alt|width|height|loading]），
--    因此种子行本身就是「编辑器产出 = 清洗后保留 = 官网渲染」三者一致的回归样本。
--    图片引用现有内置资产 public/website/img/prod/*.png，正式素材由运营替换。
--    按固定 uid + 标识双重判存，重复执行不产生第二份；标题与摘要冠「示例」。
-- -----------------------------------------------------------------------------

-- 5.1 形态「已上线」两条：供列表按发布时间倒序与分页验收
INSERT INTO articles (uid, slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by)
SELECT '00000000-0000-4000-8000-000000000121'::uuid, 'example-012-online-a',
       '示例 012：线上只读形态甲', '/website/img/prod/scene-hero.png',
       '线上只读修订后的样例：本条只在发布表有一行，界面对它只提供「查看」与「下线」。',
       '<h2>示例正文：线上只读</h2>'
       || '<p>本条由迁移 012 种入，<strong>用于链路验收</strong>，正式素材由运营替换。'
       || '它正在上线，所以没有编辑与删除入口：改内容必须先下线，官网因此永不被半成品覆盖。</p>'
       || '<img src="/website/img/prod/lifestyle-1.png" alt="示例配图：桌面收纳场景" width="1200" height="675" loading="lazy">'
       || '<h3>本条用来验收</h3>'
       || '<ol><li>列表按发布时间倒序，详情走 <code>/article/example-012-online-a</code></li>'
       || '<li>绕过界面直接 PATCH / DELETE 发布行被服务端拒绝</li>'
       || '<li>下线后整行出现在未发布侧且浏览量延续</li></ol>',
       (SELECT id FROM article_categories WHERE slug = 'news'),
       jsonb_build_array('示例', '线上只读'), '内容示例组', 1,
       NOW() - INTERVAL '3 days', 5, NULL
 WHERE NOT EXISTS (SELECT 1 FROM articles WHERE uid = '00000000-0000-4000-8000-000000000121'::uuid)
   AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-012-online-a')
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-012-online-a');

INSERT INTO articles (uid, slug, title, cover_image, summary, body, category_id, tags, author, status, published_at, view_count, created_by)
SELECT '00000000-0000-4000-8000-000000000122'::uuid, 'example-012-online-b',
       '示例 012：线上只读形态乙', '/website/img/prod/cube-closeup.png',
       '第二条线上样例，与甲条构成倒序与翻页的最小样本。',
       '<h2>示例正文：分页与倒序</h2>'
       || '<p>本条的发布时间晚于甲条，官网列表 SHOULD 把它排在前面。</p>'
       || '<ul><li>翻页不重复、不遗漏</li>'
       || '<li>分类名由接口随行下发，界面不写死占位分类</li></ul>'
       || '<blockquote>已下线与草稿在草稿表（<code>state</code> 2 与 0），发布表里没有它们的行。</blockquote>',
       (SELECT id FROM article_categories WHERE slug = 'buiness'),
       jsonb_build_array('示例', '分页'), '内容示例组', 1,
       NOW() - INTERVAL '1 day', 2, NULL
 WHERE NOT EXISTS (SELECT 1 FROM articles WHERE uid = '00000000-0000-4000-8000-000000000122'::uuid)
   AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-012-online-b')
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-012-online-b');

-- 5.2 形态「草稿」一条：无作者、无分类、从未上线
INSERT INTO article_drafts (uid, slug, title, cover_image, summary, body, category_id, tags, author, state, view_count, created_by)
SELECT '00000000-0000-4000-8000-000000000123'::uuid, 'example-012-draft',
       '示例 012：纯草稿不可经地址访问', NULL,
       '从未发布过的草稿：发布表里没有它的行，官网列表、搜索与详情地址都取不到。',
       '<h2>草稿正文</h2>'
       || '<p>这条内容只在草稿表有一行，<code>state=0</code>，分类与作者都还没填。'
       || '它用来验收「未发布内容不可经地址访问，其标题与摘要不得泄漏到任何公开接口」。</p>',
       NULL, jsonb_build_array('示例'), NULL, 0, 0, NULL
 WHERE NOT EXISTS (SELECT 1 FROM article_drafts WHERE uid = '00000000-0000-4000-8000-000000000123'::uuid)
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-012-draft')
   AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-012-draft');

-- 5.3 形态「已下线」一条：state=2、带非零浏览量与历史发布时间
--     专门验收「下线后内容仍在、可编辑、可重新发布且计数与首次发布时间延续」
INSERT INTO article_drafts (uid, slug, title, cover_image, summary, body, category_id, tags, author, state, view_count, published_at, created_by)
SELECT '00000000-0000-4000-8000-000000000124'::uuid, 'example-012-offline',
       '示例 012：已下线仍可编辑', '/website/img/prod/mem-box.png',
       '已下线的样例：整行从发布表搬回草稿表并标 state=2，浏览量与历史发布时间随行保留。',
       '<h2>示例正文：已下线形态</h2>'
       || '<p>这条资讯曾上线，被浏览 <strong>12</strong> 次后下线。它与草稿的区别只有一个状态标签与「曾上线」的身份：</p>'
       || '<ul><li>编辑与删除入口都可用（改动落本行）</li>'
       || '<li>重新发布后 <code>view_count</code> 仍是 12、发布时间仍是历史值</li>'
       || '<li>官网在其下线期间取不到它，反复访问也不计数</li></ul>'
       || '<hr />'
       || '<p><em>本条由迁移 012 种入，正式素材由运营替换。</em></p>',
       (SELECT id FROM article_categories WHERE slug = 'news'),
       jsonb_build_array('示例', '已下线'), '内容示例组', 2, 12,
       NOW() - INTERVAL '30 days', NULL
 WHERE NOT EXISTS (SELECT 1 FROM article_drafts WHERE uid = '00000000-0000-4000-8000-000000000124'::uuid)
   AND NOT EXISTS (SELECT 1 FROM article_drafts WHERE slug = 'example-012-offline')
   AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'example-012-offline');

-- -----------------------------------------------------------------------------
-- 6. 执行后核对（期望：发布表无非 1 状态行 / 两表 uid 各自不重复 / 副本列已消失 /
--    下线行带浏览量到达草稿表 / 判重表的外键与索引未被动过）
--    全部用标量子查询，避免聚合列与 EXISTS 子链接在 UNION 分支里读出歧义值
-- -----------------------------------------------------------------------------
SELECT (SELECT count(*) FROM articles WHERE status <> 1)                        AS bad_status_rows,
       (SELECT count(*) FROM articles WHERE uid IS NULL)                         AS online_uid_missing,
       (SELECT count(*) FROM (SELECT uid FROM articles GROUP BY uid HAVING count(*)>1) x) AS online_dup_uid,
       (SELECT count(*) FROM (SELECT uid FROM article_drafts GROUP BY uid HAVING count(*)>1) y) AS draft_dup_uid,
       (SELECT count(*) FROM information_schema.columns
          WHERE table_name='article_drafts' AND column_name='published_id')      AS published_id_column,
       (SELECT count(*) FROM article_drafts WHERE state NOT IN (0,2))            AS bad_state_rows,
       (SELECT count(*) FROM article_drafts WHERE state=2 AND view_count>0)      AS offline_with_views,
       (SELECT count(*) FROM article_drafts WHERE slug LIKE 'example-012-%')     AS draft_seed_rows,
       (SELECT count(*) FROM articles WHERE slug LIKE 'example-012-%')           AS online_seed_rows,
       (SELECT count(*) FROM pg_constraint WHERE conname='article_view_dedupe_article_id_fkey') AS dedupe_cascade_fk,
       (SELECT count(*) FROM pg_indexes WHERE indexname='idx_article_view_dedupe_window')        AS dedupe_window_index;
