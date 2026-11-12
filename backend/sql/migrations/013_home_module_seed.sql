-- =============================================================================
-- 013_home_module_seed.sql · 首页模块划分对齐（区块结构版本 2）
-- =============================================================================
-- 背景：首页装修改造把首页按背景色带切成 9 个模块（hero / intro-eco / mvv / values /
--       feature-products / story / pm-entry / latest-news / cta-banner），模块之下用
--       `children` 装载基础元素。数据侧无表结构变更——content_json/draft_json 是整份
--       覆盖的 JSONB，树形天然承载（D11）。
--
-- 本脚本做三件事，全部条件保护、幂等可重复执行：
--   1. 判定 home 线上 content_json 是否仍等于「内置默认划分」（与前端 pageDefaults.home、
--      002 种子同源）。改造后的模块划分与默认划分同构（9 段、id/type 与顺序不变），
--      等价即达标不重写；不等价即视为已被运营编辑，一行不动。
--   2. draft_json 同样只做判定，空草稿不种默认值（编辑器口径：草稿为空则回落线上内容）。
--   3. 把 pages.schema_version（迁移 005_pages_schema_version.sql 加的列）标记为 2，
--      使「哪些页仍是默认结构、可安全批量重种」可被查询；该列不存在时只提示，不报错。
--
-- 说明：渲染正确性不依赖本脚本。前端 parseBlocks 每次读取都会逐块跑 MIGRATIONS
--       （v1→v2 归一 children），未跑本迁移的库照样能渲染嵌套结构。
--       执行：psql -d centremix -f 013_home_module_seed.sql
--       回滚：同目录 013_home_module_seed.rollback.sql（同样条件保护，不回吞运营内容）
--       与 010/011/012（产品链、资讯链）无执行顺序依赖，仅编号连续登记。
-- =============================================================================

DO $do$
DECLARE
  -- 内置默认划分：与 002_page_blocks.sql 的 home 种子、buinessweb/src/website/pageDefaults.ts
  -- 的 home 数组同源；三处任一改内容需同步本字面量，否则本脚本会判定为「已被编辑」而跳过。
  v_default CONSTANT JSONB := $seed$
{
  "blocks": [
    { "id": "home-hero", "type": "hero", "visible": true, "props": {
        "eyebrow": "Centremix 芯联创 · 数据守护者",
        "title": ["聚焦你的多元", "存储你的<em>生活</em>"],
        "lede": "Centremix 芯联创，2022 年应数字时代而生，基于与希捷科技的合作，以对用户需求的精准捕捉，将「便捷存储」作为核心支点，在浩瀚数据海洋中，为每一份信息构筑安全可靠的专属空间。",
        "cta1": { "text": "了解品牌故事 →", "link": "/about" },
        "cta2": { "text": "浏览产品矩阵", "link": "/products" },
        "meta": [
          { "label": "EST.", "value": "2022 · 品牌创立" },
          { "label": "PARTNER.", "value": "希捷 · LaCie 中国区总代理" },
          { "label": "RADIATION.", "value": "业务辐射全国（除西藏外）" }
        ],
        "image": "/website/img/prod/scene-hero.png",
        "imageAlt": "Centremix 芯联创 存储产品场景",
        "floaterLeft": { "title": "回归生活", "en": "RETURN TO LIFE" },
        "floaterRight": { "title": "数据守护者", "en": "DATA GUARDIAN" }
    } },
    { "id": "home-intro", "type": "intro-eco", "visible": true, "props": {
        "eyebrow": "品牌介绍 · BRAND INTRODUCTION",
        "title": ["品牌核心理念", "CORE BRAND ELEMENTS"],
        "desc": "真正的科技价值，在于让数据回归生活本质。我们不止于打造高效的存储载体，更致力于构建连接数字世界与生活场景的纽带。",
        "items": [
          { "h4": "RETURN TO LIFE · 回归生活", "p": "Centremix 芯联创，2022 年应数字时代而生，基于与希捷科技的合作，以对用户需求的精准捕捉，将「便捷存储」作为核心支点，在浩瀚数据海洋中，为每一份信息构筑安全可靠的专属空间。" },
          { "h4": "CONVENIENT STORAGE · 便捷存储", "p": "我们坚信：真正的科技价值，在于让数据回归生活本质。因此，我们不止于打造高效的存储载体，更致力于构建连接数字世界与生活场景的纽带——一端对接日新月异的数字生态，一端锚定你珍视的当下与过往，让数据空间与日常需求无缝相融。" },
          { "h4": "DATA GUARDIAN · 数据守护者", "p": "Centremix 芯联创，愿以「数据守护者」之名，用稳定可靠的服务，让每一次存储都成为安心的承诺，让每一份数据都能为生活赋能。" }
        ]
    } },
    { "id": "home-mvv", "type": "mvv", "visible": true, "props": {
        "eyebrow": "使命与愿景 · MISSION & VISION",
        "title": ["简单且安心的", "数字生活体验"],
        "desc": "让每一个人的数字资产都能被安全、便捷地存储与管理，让数据真正融入生活、服务生活。",
        "theme": "paper",
        "cards": [
          { "tag": "BRAND MISSION · 品牌使命", "text": "让每一个人的数字资产都能被安全、便捷地存储与管理，让数据真正融入生活、服务生活，消除数字时代人们在数据存储与使用中的顾虑，为用户创造简单且安心的数字生活体验。" },
          { "tag": "BRAND VISION · 品牌愿景", "text": "成为全球用户信赖的数字存储与管理伙伴，推动数据空间与生活场景的深度融合，引领便捷、安全、人性化的数字存储新方式，让每一份数据都能在合适的地方发挥价值，陪伴用户走过生活的每一个重要时刻。" }
        ]
    } },
    { "id": "home-values", "type": "values", "visible": true, "props": {
        "eyebrow": "品牌价值观 · BRAND VALUES",
        "title": ["四个价值准则", "指引每一次选择"],
        "desc": "用户至上、安全可靠、创新进取、和谐共生——它们是 Centremix 芯联创一切产品与服务的出发点。",
        "items": [
          { "icon": "user", "title": "用户至上", "en": "USER FIRST", "text": "始终将用户的需求和体验放在首位，从用户角度出发设计产品和服务，用心聆听用户反馈，不断优化升级，让用户在数据存储与管理中感受到便捷与贴心。" },
          { "icon": "shield", "title": "安全可靠", "en": "SECURITY", "text": "视数据安全为生命线，凭借先进的技术和严谨的流程，为用户的数据构建坚实的安全屏障，让用户对数据存储充满信心。" },
          { "icon": "bulb", "title": "创新进取", "en": "INNOVATION", "text": "紧跟数字时代的发展步伐，勇于探索新技术、新方法，在存储技术、服务模式等方面不断创新，以适应不断变化的数字环境和用户需求，保持品牌的活力与竞争力。" },
          { "icon": "harmony", "title": "和谐共生", "en": "HARMONY", "text": "秉持数据空间与生活和谐共生的理念，让技术服务于生活，使数据存储与管理成为生活的助力，促进数字与生活的良性互动。" }
        ]
    } },
    { "id": "home-products", "type": "feature-products", "visible": true, "props": {
        "eyebrow": "精选产品 · FEATURED PRODUCTS",
        "title": ["热销产品", "一图速览"],
        "desc": "移动存储、内存升级产品线，多款产品满足不同场景需求。",
        "theme": "paper", "limit": 3,
        "moreText": "查看全部产品 →", "moreLink": "/products"
    } },
    { "id": "home-story", "type": "story", "visible": true, "props": {
        "eyebrow": "品牌背景 · BRAND BACKGROUND",
        "title": ["与希捷深度合作", "为国人而来"],
        "paras": [
          "Centremix 芯联创主体为北京展创振华科技有限公司，是一家致力于计算机硬件、存储产品分销与解决方案、技术服务与推广于一体的高科技企业。",
          "公司凭借强健的销售能力与广阔的地域覆盖，成为希捷重要的合作伙伴，先后签约了希捷中国区总代理和 LACIE 中国区总代理。2022 年，与希捷工厂深度合作，成立品牌 Centremix 芯联创，希望为国人带来兼具高品质与高性价比的存储类产品。"
        ],
        "pillars": [
          { "en": "SINCE 2012", "cn": "十年稳定发展" },
          { "en": "2022", "cn": "品牌创立" },
          { "en": "EXCEPT TIBET", "cn": "辐射全国各省市" }
        ],
        "image": "/website/img/prod/lifestyle-1.png",
        "imageAlt": "Centremix 存储产品融入生活",
        "backers": [
          { "title": "BUSINESS · 业务模块", "desc": "经过多年的发展，与多家知名企业建立了战略合作伙伴关系，涉及计算机、通信、教育、影视、金融、政府等多个行业领域。公司总部位于北京，并在上海、广州、成都等城市均设有分公司，以丰富的产品服务经验、完善的服务网络，为用户提供规范化和专业化的物流配送、市场推广及营销服务。" },
          { "title": "RADIATION RANGE · 业务辐射范围", "desc": "从 2021 年开始，业务规模稳步增长。十年来，展创业务辐射全国（除西藏外）各省份城市，触及省代及一级经销商达两百多个。随着希捷 SSD、外置硬盘和 LaCie 等产品线的独家授权，经销网络发展迅猛，通路渠道稳定且高效运行。" }
        ]
    } },
    { "id": "home-pm", "type": "pm-entry", "visible": true, "props": {
        "word": "PRODUCTS", "num": "03",
        "title": "产品矩阵", "sub": "PRODUCT MATRIX",
        "desc": "以「便捷存储」为核心，为国人带来兼具高品质与高性价比的存储类产品。",
        "btnText": "进入产品中心 →", "btnLink": "/products"
    } },
    { "id": "home-news", "type": "latest-news", "visible": true, "props": {
        "eyebrow": "新闻咨询 · NEWS",
        "title": ["最新动态", "品牌洞察"],
        "desc": "聚焦 Centremix 芯联创的新品发布、产品科普与行业趋势。",
        "theme": "paper", "limit": 3,
        "moreText": "查看全部资讯 →", "moreLink": "/news"
    } },
    { "id": "home-cta", "type": "cta-banner", "visible": true, "props": {
        "title": "让每一次存储，都成为安心的承诺",
        "desc": "了解 Centremix 芯联创的产品矩阵与合作机会。",
        "btnText": "售后服务 →", "btnLink": "/contact"
    } }
  ]
}
$seed$::jsonb;

  v_has_col  BOOLEAN;
  v_page_id  BIGINT;
  v_content  JSONB;
  v_draft    JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pages' AND column_name = 'schema_version'
  ) INTO v_has_col;

  -- FOR UPDATE：与并发保存草稿互斥，避免对齐写与运营写交叉
  SELECT id, content_json, draft_json INTO v_page_id, v_content, v_draft
    FROM pages WHERE slug = 'home' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE NOTICE '013_home_module_seed：库里没有 slug=home 的行，跳过（本次迁移不适用）';
    RETURN;
  END IF;

  -- 1) 线上内容对齐：默认划分与改造后的模块划分同构（9 段、id/type 顺序不变），
  --    因此等价即达标，不做无意义的整份重写；不等价一律视为运营内容，绝不动摇。
  IF v_content = v_default THEN
    RAISE NOTICE '013_home_module_seed：home 线上内容 = 内置默认 9 模块划分，判定为「仍是默认结构」，无需重写';
  ELSE
    RAISE NOTICE '013_home_module_seed：home 线上内容已被运营编辑（与内置默认不等价），一行不改；嵌套结构由前端 parseBlocks 读取时升级';
  END IF;

  -- 2) 草稿：只在「等价于默认划分」时确认达标。
  --    空草稿不种入默认值——编辑器的回落口径是「draft 为空则用线上内容」，
  --    种一份与线上一致的草稿会把它变成「有未发布改动」，并绕过发布前的空草稿护栏。
  IF v_draft = '{}'::jsonb THEN
    RAISE NOTICE '013_home_module_seed：home 草稿为空，按口径保持为空（编辑器回落到线上版本）';
  ELSIF v_draft = v_default THEN
    RAISE NOTICE '013_home_module_seed：home 草稿 = 内置默认划分，无需重写';
  ELSE
    RAISE NOTICE '013_home_module_seed：home 草稿在编（与内置默认不等价），保留原样';
  END IF;

  -- 3) 结构版本标记：仅对「仍是默认结构」的页面置 2，便于后续按版本做增量扫描
  IF NOT v_has_col THEN
    RAISE NOTICE '013_home_module_seed：pages.schema_version 列不存在（005_pages_schema_version.sql 未执行），标记跳过，不影响渲染';
  ELSIF v_content = v_default THEN
    UPDATE pages SET schema_version = 2 WHERE id = v_page_id;
    RAISE NOTICE '013_home_module_seed：home 的 schema_version 置 2（区块结构版本 2：children 装载基础元素）';
  ELSE
    RAISE NOTICE '013_home_module_seed：home 非默认结构，schema_version 保持原值，待运营在编辑器保存后自然升级';
  END IF;
END
$do$;

-- 复核（按需执行；未跑 005 时去掉 schema_version 一列）
-- SELECT id, slug, status, schema_version,
--        jsonb_array_length(content_json -> 'blocks') AS online_blocks,
--        content_json::text LIKE '%children%'  AS online_nested,
--        draft_json  ::text LIKE '%children%'  AS draft_nested
--   FROM pages WHERE slug = 'home';
