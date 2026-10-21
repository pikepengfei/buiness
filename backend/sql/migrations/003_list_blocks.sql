-- =============================================================================
-- 003_list_blocks.sql · 产品矩阵 / 资讯列表 / 图文海报改为区块驱动
-- =============================================================================
-- 背景：官网产品中心与新闻咨询页的列表区、产品速览海报区原为前端硬编码，
--       管理端无法修改其文案与配图。本轮把它们改为区块：
--   product-grid · 产品矩阵列表（区头文案可编辑，筛选/搜索/分页结构固定）
--   news-feed    · 资讯列表（区头可留空，分类筛选/分页结构固定）
--   poster-grid  · 图文海报网格（配图、角标、说明、跳转均可编辑）
--   cta-banner   · 资讯页尾部 CTA（复用既有区块）
--
-- 说明：
--   1. 幂等：按区块 type 是否存在判断，重复执行不会产生重复区块。
--   2. 只做「插入」，不重写整页：管理端已编辑的其余区块与顺序保持不变。
--   3. 插入位置：page-hero（第 1 块）之后。
--   4. 执行：psql -d centremix -f 003_list_blocks.sql（在 002_page_blocks.sql 之后）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- products：插入 product-grid
-- -----------------------------------------------------------------------------
WITH ins AS (
  SELECT p.id,
    jsonb_build_object('blocks',
      COALESCE((SELECT jsonb_agg(b) FROM jsonb_array_elements(p.content_json->'blocks')
                 WITH ORDINALITY t(b, ord) WHERE ord <= 1), '[]'::jsonb)
      || jsonb_build_array(
        '{"id":"products-grid","type":"product-grid","visible":true,"props":{
           "eyebrow":"产品矩阵",
           "title":["存储产品矩阵","覆盖全场景"],
           "desc":"产品矩阵围绕「便捷存储」展开，以原厂颗粒与数据安全为核心，满足个人与家庭、创作者与玩家的不同需求。",
           "theme":"","pageSize":9
         }}'::jsonb)
      || COALESCE((SELECT jsonb_agg(b) FROM jsonb_array_elements(p.content_json->'blocks')
                 WITH ORDINALITY t(b, ord) WHERE ord > 1), '[]'::jsonb)
    ) AS new_json
  FROM pages p
  WHERE p.slug = 'products' AND p.content_json::text NOT LIKE '%"product-grid"%'
)
UPDATE pages p
   SET content_json = ins.new_json,
       draft_json   = CASE WHEN p.draft_json::text NOT LIKE '%"product-grid"%'
                            AND p.draft_json ? 'blocks' THEN ins.new_json ELSE p.draft_json END
  FROM ins WHERE p.id = ins.id;

-- -----------------------------------------------------------------------------
-- news：依次插入 news-feed / poster-grid / cta-banner
-- -----------------------------------------------------------------------------
WITH ins AS (
  SELECT p.id,
    jsonb_build_object('blocks',
      COALESCE((SELECT jsonb_agg(b) FROM jsonb_array_elements(p.content_json->'blocks')
                 WITH ORDINALITY t(b, ord) WHERE ord <= 1), '[]'::jsonb)
      || jsonb_build_array(
        '{"id":"news-feed","type":"news-feed","visible":true,"props":{
           "eyebrow":"","title":[],"desc":"","theme":"","pageSize":6
         }}'::jsonb,
        '{"id":"news-poster","type":"poster-grid","visible":true,"props":{
           "eyebrow":"产品速览",
           "title":["热销产品","一图速览"],
           "desc":"移动存储、内存升级产品线，多款产品满足不同场景需求。",
           "theme":"paper",
           "moreText":"查看全部产品 →","moreLink":"/products",
           "items":[
             {"image":"/website/img/prod/lifestyle-1.png","tag":"随身存储","caption":"随行随存 · 记录生活每一刻","link":"/products"},
             {"image":"/website/img/prod/lifestyle-3.png","tag":"移动存储","caption":"小方块 · 随身扩容","link":"/products"},
             {"image":"/website/img/prod/mem-box.png","tag":"内存升级","caption":"炫影系列 · 装机优选","link":"/products"},
             {"image":"/website/img/prod/cube-closeup.png","tag":"希捷联名","caption":"原厂颗粒 · 品质保障","link":"/products"}
           ]
         }}'::jsonb,
        '{"id":"news-cta","type":"cta-banner","visible":true,"props":{
           "title":"关注品牌动态",
           "desc":"留下您的联系方式，第一时间获取 Centremix 芯联创的新品资讯与技术动态。",
           "btnText":"售后服务 →","btnLink":"/contact"
         }}'::jsonb)
      || COALESCE((SELECT jsonb_agg(b) FROM jsonb_array_elements(p.content_json->'blocks')
                 WITH ORDINALITY t(b, ord) WHERE ord > 1), '[]'::jsonb)
    ) AS new_json
  FROM pages p
  WHERE p.slug = 'news' AND p.content_json::text NOT LIKE '%"news-feed"%'
)
UPDATE pages p
   SET content_json = ins.new_json,
       draft_json   = CASE WHEN p.draft_json::text NOT LIKE '%"news-feed"%'
                            AND p.draft_json ? 'blocks' THEN ins.new_json ELSE p.draft_json END
  FROM ins WHERE p.id = ins.id;
