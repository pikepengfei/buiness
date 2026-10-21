/**
 * 官网 5 个导航页的内置默认区块内容（兜底数据）
 *
 * 用途：公开页面接口失败或 content_json 为空时，前台仍能渲染与设计稿一致的完整页面，
 * 保证官网永不白屏。内容与 backend/sql/migrations/002_page_blocks.sql 种子保持一致。
 */
import type { Block } from './blocks';

export const DEFAULT_BLOCKS: Record<string, Block[]> = {
  home: [
    { id: 'home-hero', type: 'hero', visible: true, props: {
      eyebrow: 'Centremix 芯联创 · 数据守护者',
      title: ['聚焦你的多元', '存储你的<em>生活</em>'],
      lede: 'Centremix 芯联创，2022 年应数字时代而生，基于与希捷科技的合作，以对用户需求的精准捕捉，将「便捷存储」作为核心支点，在浩瀚数据海洋中，为每一份信息构筑安全可靠的专属空间。',
      cta1: { text: '了解品牌故事 →', link: '/about' },
      cta2: { text: '浏览产品矩阵', link: '/products' },
      meta: [
        { label: 'EST.', value: '2022 · 品牌创立' },
        { label: 'PARTNER.', value: '希捷 · LaCie 中国区总代理' },
        { label: 'RADIATION.', value: '业务辐射全国（除西藏外）' },
      ],
      image: '/website/img/prod/scene-hero.png',
      imageAlt: 'Centremix 芯联创 存储产品场景',
      floaterLeft: { title: '回归生活', en: 'RETURN TO LIFE' },
      floaterRight: { title: '数据守护者', en: 'DATA GUARDIAN' },
    } },
    { id: 'home-intro', type: 'intro-eco', visible: true, props: {
      eyebrow: '品牌介绍 · BRAND INTRODUCTION',
      title: ['品牌核心理念', 'CORE BRAND ELEMENTS'],
      desc: '真正的科技价值，在于让数据回归生活本质。我们不止于打造高效的存储载体，更致力于构建连接数字世界与生活场景的纽带。',
      items: [
        { h4: 'RETURN TO LIFE · 回归生活', p: 'Centremix 芯联创，2022 年应数字时代而生，基于与希捷科技的合作，以对用户需求的精准捕捉，将「便捷存储」作为核心支点，在浩瀚数据海洋中，为每一份信息构筑安全可靠的专属空间。' },
        { h4: 'CONVENIENT STORAGE · 便捷存储', p: '我们坚信：真正的科技价值，在于让数据回归生活本质。因此，我们不止于打造高效的存储载体，更致力于构建连接数字世界与生活场景的纽带——一端对接日新月异的数字生态，一端锚定你珍视的当下与过往，让数据空间与日常需求无缝相融。' },
        { h4: 'DATA GUARDIAN · 数据守护者', p: 'Centremix 芯联创，愿以「数据守护者」之名，用稳定可靠的服务，让每一次存储都成为安心的承诺，让每一份数据都能为生活赋能。' },
      ],
    } },
    { id: 'home-mvv', type: 'mvv', visible: true, props: {
      eyebrow: '使命与愿景 · MISSION & VISION',
      title: ['简单且安心的', '数字生活体验'],
      desc: '让每一个人的数字资产都能被安全、便捷地存储与管理，让数据真正融入生活、服务生活。',
      theme: 'paper',
      cards: [
        { tag: 'BRAND MISSION · 品牌使命', text: '让每一个人的数字资产都能被安全、便捷地存储与管理，让数据真正融入生活、服务生活，消除数字时代人们在数据存储与使用中的顾虑，为用户创造简单且安心的数字生活体验。' },
        { tag: 'BRAND VISION · 品牌愿景', text: '成为全球用户信赖的数字存储与管理伙伴，推动数据空间与生活场景的深度融合，引领便捷、安全、人性化的数字存储新方式，让每一份数据都能在合适的地方发挥价值，陪伴用户走过生活的每一个重要时刻。' },
      ],
    } },
    { id: 'home-values', type: 'values', visible: true, props: {
      eyebrow: '品牌价值观 · BRAND VALUES',
      title: ['四个价值准则', '指引每一次选择'],
      desc: '用户至上、安全可靠、创新进取、和谐共生——它们是 Centremix 芯联创一切产品与服务的出发点。',
      items: [
        { icon: 'user', title: '用户至上', en: 'USER FIRST', text: '始终将用户的需求和体验放在首位，从用户角度出发设计产品和服务，用心聆听用户反馈，不断优化升级，让用户在数据存储与管理中感受到便捷与贴心。' },
        { icon: 'shield', title: '安全可靠', en: 'SECURITY', text: '视数据安全为生命线，凭借先进的技术和严谨的流程，为用户的数据构建坚实的安全屏障，让用户对数据存储充满信心。' },
        { icon: 'bulb', title: '创新进取', en: 'INNOVATION', text: '紧跟数字时代的发展步伐，勇于探索新技术、新方法，在存储技术、服务模式等方面不断创新，以适应不断变化的数字环境和用户需求，保持品牌的活力与竞争力。' },
        { icon: 'harmony', title: '和谐共生', en: 'HARMONY', text: '秉持数据空间与生活和谐共生的理念，让技术服务于生活，使数据存储与管理成为生活的助力，促进数字与生活的良性互动。' },
      ],
    } },
    { id: 'home-products', type: 'feature-products', visible: true, props: {
      eyebrow: '精选产品 · FEATURED PRODUCTS',
      title: ['热销产品', '一图速览'],
      desc: '移动存储、内存升级产品线，多款产品满足不同场景需求。',
      theme: 'paper', limit: 3,
      moreText: '查看全部产品 →', moreLink: '/products',
    } },
    { id: 'home-story', type: 'story', visible: true, props: {
      eyebrow: '品牌背景 · BRAND BACKGROUND',
      title: ['与希捷深度合作', '为国人而来'],
      paras: [
        'Centremix 芯联创主体为北京展创振华科技有限公司，是一家致力于计算机硬件、存储产品分销与解决方案、技术服务与推广于一体的高科技企业。',
        '公司凭借强健的销售能力与广阔的地域覆盖，成为希捷重要的合作伙伴，先后签约了希捷中国区总代理和 LACIE 中国区总代理。2022 年，与希捷工厂深度合作，成立品牌 Centremix 芯联创，希望为国人带来兼具高品质与高性价比的存储类产品。',
      ],
      pillars: [
        { en: 'SINCE 2012', cn: '十年稳定发展' },
        { en: '2022', cn: '品牌创立' },
        { en: 'EXCEPT TIBET', cn: '辐射全国各省市' },
      ],
      image: '/website/img/prod/lifestyle-1.png',
      imageAlt: 'Centremix 存储产品融入生活',
      backers: [
        { title: 'BUSINESS · 业务模块', desc: '经过多年的发展，与多家知名企业建立了战略合作伙伴关系，涉及计算机、通信、教育、影视、金融、政府等多个行业领域。公司总部位于北京，并在上海、广州、成都等城市均设有分公司，以丰富的产品服务经验、完善的服务网络，为用户提供规范化和专业化的物流配送、市场推广及营销服务。' },
        { title: 'RADIATION RANGE · 业务辐射范围', desc: '从 2021 年开始，业务规模稳步增长。十年来，展创业务辐射全国（除西藏外）各省份城市，触及省代及一级经销商达两百多个。随着希捷 SSD、外置硬盘和 LaCie 等产品线的独家授权，经销网络发展迅猛，通路渠道稳定且高效运行。' },
      ],
    } },
    { id: 'home-pm', type: 'pm-entry', visible: true, props: {
      word: 'PRODUCTS', num: '03',
      title: '产品矩阵', sub: 'PRODUCT MATRIX',
      desc: '以「便捷存储」为核心，为国人带来兼具高品质与高性价比的存储类产品。',
      btnText: '进入产品中心 →', btnLink: '/products',
    } },
    { id: 'home-news', type: 'latest-news', visible: true, props: {
      eyebrow: '新闻咨询 · NEWS',
      title: ['最新动态', '品牌洞察'],
      desc: '聚焦 Centremix 芯联创的新品发布、产品科普与行业趋势。',
      theme: 'paper', limit: 3,
      moreText: '查看全部资讯 →', moreLink: '/news',
    } },
    { id: 'home-cta', type: 'cta-banner', visible: true, props: {
      title: '让每一次存储，都成为安心的承诺',
      desc: '了解 Centremix 芯联创的产品矩阵与合作机会。',
      btnText: '售后服务 →', btnLink: '/contact',
    } },
  ],
  about: [
    { id: 'about-hero', type: 'page-hero', visible: true, props: {
      crumb: [{ text: '首页', link: '/' }, { text: '关于我们' }],
      title: ['渠道深耕十余年', '自有品牌新篇章'],
      subtitle: '北京展创振华科技有限公司，以希捷中国区总代理身份深耕存储渠道，2022 年与希捷工厂深度合作创立自营品牌 Centremix 芯联创，自主设计、生产与销售，为国人带来兼具高品质与高性价比的存储类产品。',
    } },
    { id: 'about-intro', type: 'intro-eco', visible: true, props: {
      eyebrow: '公司介绍 · COMPANY PROFILE',
      title: ['从希捷总代', '到自有品牌'],
      desc: '展创振华以希捷中国区总代理的身份深耕存储渠道，2022 年与希捷工厂深度合作创立自营品牌 Centremix 芯联创，开启自主设计、生产与销售的新篇章。',
      items: [
        { h4: 'COMPANY · 公司主体', p: 'Centremix 芯联创主体为北京展创振华科技有限公司，是一家致力于计算机硬件、存储产品分销与解决方案、技术服务与推广于一体的高科技企业。公司凭借强健的销售能力与广阔的地域覆盖，成为希捷重要的合作伙伴，先后签约了希捷中国区总代理和 LACIE 中国区总代理。' },
        { h4: 'BUSINESS · 业务模块', p: '经过多年的发展，公司与多家知名企业建立了战略合作伙伴关系，涉及计算机、通信、教育、影视、金融、政府等多个行业领域。公司总部位于北京，并在上海、广州、成都等城市均设有分公司，为用户提供规范化和专业化的物流配送、市场推广及营销服务。' },
        { h4: 'RADIATION · 业务辐射范围', p: '十年来，展创业务辐射全国（除西藏外）各省份城市，触及省代及一级经销商达两百多个。随着希捷 SSD、外置硬盘和 LaCie 等产品线的独家授权，经销网络发展迅猛，通路渠道稳定且高效运行。' },
      ],
    } },
    { id: 'about-timeline', type: 'timeline', visible: true, props: {
      eyebrow: '品牌历程 · MILESTONES',
      title: ['十年渠道深耕', '里程碑时刻'],
      desc: '从签约希捷中国区总代理，到创立自营品牌 Centremix 芯联创，一步一个脚印，让「便捷存储」走进千家万户。',
      theme: 'paper',
      items: [
        { year: '2012 · 渠道深耕', title: '展创振华成立 · 签约希捷 / LaCie 中国区总代理', text: '公司总部位于北京，凭借强健的销售能力与广阔的地域覆盖，成为希捷重要的合作伙伴，先后签约了希捷中国区总代理和 LACIE 中国区总代理，深耕计算机硬件与存储产品分销。' },
        { year: '2021 · 稳步增长', title: '业务规模稳步增长 · 经销网络迅猛发展', text: '从 2021 年开始，业务规模稳步增长，辐射全国（除西藏外）各省份城市，触及省代及一级经销商达两百多个，通路渠道稳定且高效运行。' },
        { year: '2022 · 品牌创立', title: '与希捷工厂深度合作 · 成立 Centremix 芯联创', text: '与希捷工厂深度合作，成立品牌 Centremix 芯联创，希望为国人带来兼具高品质与高性价比的存储类产品，以「便捷存储」为核心支点开启自有品牌之路。' },
        { year: '2026 · 品牌化运营', title: '品牌手册落地 · 全渠道品牌运营', text: '以品牌手册为纲，天猫旗舰店、小红书官号等品牌阵地全面运营，让 Centremix 芯联创以「数据守护者」之名走进更多人的生活。' },
      ],
    } },
    { id: 'about-story', type: 'story', visible: true, props: {
      eyebrow: '品牌背书',
      title: ['展创振华科技', '品牌坚实后盾'],
      paras: [],
      pillars: [],
      backers: [
        { title: 'BRAND BACKER · 母公司', desc: '北京展创振华科技有限公司，2012 年成立，先后签约希捷中国区总代理与 LACIE 中国区总代理，业务辐射全国（除西藏外）各省份城市，触及省代及一级经销商达两百多个。' },
        { title: 'BRAND STRENGTH · 品牌实力', desc: '以丰富的产品服务经验、完善的服务网络以及与厂商的紧密合作，为用户提供规范化和专业化的物流配送、市场推广及营销服务，为 Centremix 芯联创提供坚实背书。' },
      ],
      brandWall: [
        { text: 'SEAGATE 希捷 · 原厂颗粒合作' },
        { text: 'TMALL 天猫旗舰店 ↗', url: 'https://centremix.tmall.com/category.htm' },
        { text: 'JD 京东自营' },
        { text: 'XIAOHONGSHU 小红书官号 ↗', url: 'https://www.xiaohongshu.com/user/profile/64155be40000000011020037' },
      ],
    } },
    { id: 'about-cta', type: 'cta-banner', visible: true, props: {
      title: '了解更多关于 Centremix 芯联创',
      desc: '欢迎来到我们的品牌世界，与我们共同守护每一份珍贵数据。',
      btnText: '售后服务 →', btnLink: '/contact',
    } },
  ],
  products: [
    { id: 'products-hero', type: 'page-hero', visible: true, props: {
      crumb: [{ text: '首页', link: '/' }, { text: '产品中心' }],
      title: ['Centremix 芯联创', '自有存储产品矩阵'],
      subtitle: '以「便捷存储」为核心，从移动存储到内存升级，为国人带来兼具高品质与高性价比的存储类产品。',
    } },
    { id: 'products-grid', type: 'product-grid', visible: true, props: {
      eyebrow: '产品矩阵',
      title: ['存储产品矩阵', '覆盖全场景'],
      desc: '产品矩阵围绕「便捷存储」展开，以原厂颗粒与数据安全为核心，满足个人与家庭、创作者与玩家的不同需求。',
      theme: '',
      pageSize: 9,
    } },
    { id: 'products-scene', type: 'cat-grid', visible: true, props: {
      eyebrow: '按场景选择',
      title: ['找到适合你的', '产品组合'],
      desc: '不同场景对存储的要求截然不同，按使用场景快速匹配最适合你的 Centremix 产品。',
      theme: 'paper',
      items: [
        { num: 'SCENE / 01', icon: 'phone', title: '手机扩容', text: '照片视频越拍越多、存储告急？小方块磁吸移动固态一贴即连，一键备份，手机空间瞬间翻倍。', bullets: ['小方块 CB500', '易存宝 APP 自动备份', '加密存储 · 隐私无忧'] },
        { num: 'SCENE / 02', icon: 'memory', title: '电竞装机', text: '游戏加载卡顿、多开掉帧？炫影 / 永燃星内存条高频低时序，双通道组合一键提升帧率。', bullets: ['炫影 DDR4 3200', '永燃星 DDR5 6000', 'XMP 2.0 一键超频'] },
        { num: 'SCENE / 03', icon: 'monitor', title: '创作者存储', text: '外拍、出差、演唱会现场——小方块随身携带，素材现场同步，原图原画质不压缩，创作灵感不断档。', bullets: ['小方块 CB500', '易存宝 APP 自动备份', '高速读写 · 随行随存'] },
      ],
    } },
    { id: 'products-cap', type: 'cap-flow', visible: true, props: {
      eyebrow: '产品特性',
      title: ['选择 Centremix 的理由'],
      items: [
        { step: '01', title: '原厂颗粒', text: '希捷联名原厂颗粒、三星精选颗粒与国产长鑫颗粒多线并进，品质从源头把控。', tags: ['原厂直供', '严苛筛选'] },
        { step: '02', title: '便捷存储', text: '以「便捷存储」为核心支点，围绕用户需求打磨产品，让数据存储简单、安心地融入生活。', tags: ['便捷存储', '回归生活'] },
        { step: '03', title: '数据安全', text: '专属易存宝 APP 自动备份 + 加密存储双保险，重要数据层层守护。', tags: ['自动备份', '加密存储'] },
        { step: '04', title: '无忧质保', text: '3 年质保、只换不修，内存终身质保，全国售后体系让购买后顾无忧。', tags: ['3 年质保', '只换不修'] },
      ],
    } },
    { id: 'products-cta', type: 'cta-banner', visible: true, props: {
      title: '不确定选哪款产品？',
      desc: '联系 Centremix 团队，获取 1 对 1 的选型建议与采购报价。',
      btnText: '获取建议 →', btnLink: '/contact',
    } },
  ],
  news: [
    { id: 'news-hero', type: 'page-hero', visible: true, props: {
      crumb: [{ text: '首页', link: '/' }, { text: '新闻咨询' }],
      title: ['品牌动态 · 产品洞察 · 存储趋势'],
      subtitle: '聚焦 Centremix 芯联创的新品发布、产品科普与行业趋势，帮你做出更从容的存储与升级决策。',
    } },
    { id: 'news-feed', type: 'news-feed', visible: true, props: {
      eyebrow: '', title: [], desc: '', theme: '', pageSize: 6,
    } },
    { id: 'news-poster', type: 'poster-grid', visible: true, props: {
      eyebrow: '产品速览',
      title: ['热销产品', '一图速览'],
      desc: '移动存储、内存升级产品线，多款产品满足不同场景需求。',
      theme: 'paper',
      moreText: '查看全部产品 →', moreLink: '/products',
      items: [
        { image: '/website/img/prod/lifestyle-1.png', tag: '随身存储', caption: '随行随存 · 记录生活每一刻', link: '/products' },
        { image: '/website/img/prod/lifestyle-3.png', tag: '移动存储', caption: '小方块 · 随身扩容', link: '/products' },
        { image: '/website/img/prod/mem-box.png', tag: '内存升级', caption: '炫影系列 · 装机优选', link: '/products' },
        { image: '/website/img/prod/cube-closeup.png', tag: '希捷联名', caption: '原厂颗粒 · 品质保障', link: '/products' },
      ],
    } },
    { id: 'news-cta', type: 'cta-banner', visible: true, props: {
      title: '关注品牌动态',
      desc: '留下您的联系方式，第一时间获取 Centremix 芯联创的新品资讯与技术动态。',
      btnText: '售后服务 →', btnLink: '/contact',
    } },
  ],
  contact: [
    { id: 'contact-hero', type: 'page-hero', visible: true, props: {
      crumb: [{ text: '首页', link: '/' }, { text: '售后服务' }],
      title: ['售后保障', '安心无忧'],
      subtitle: '3 年质保 · 只换不修 · 内存终身质保 · 全国联保。让每一次购买，都成为安心的承诺。',
    } },
    { id: 'contact-policy', type: 'cat-grid', visible: true, props: {
      eyebrow: '售后保障 · SERVICE POLICY',
      title: ['质保政策', '清晰透明'],
      desc: 'Centremix 芯联创为每一件产品提供明确的质保承诺，从购买之日起，安心守护每一份数据。',
      items: [
        { num: 'POLICY / 01', icon: 'shield', title: '3 年质保', text: '小方块系列移动固态硬盘享 3 年官方质保，非人为损坏均在保修范围内。', bullets: [] },
        { num: 'POLICY / 02', icon: 'check', title: '只换不修', text: '质保期内出现非人为性能故障，直接换新处理，无需等待漫长维修周期。', bullets: [] },
        { num: 'POLICY / 03', icon: 'clock', title: '内存终身质保', text: '炫影 / 永燃星系列内存条提供终身质保服务，一次购买，长久守护。', bullets: [] },
        { num: 'POLICY / 04', icon: 'users', title: '全国联保', text: '售后网络覆盖全国主要城市，支持官方渠道寄修与到店处理，服务便捷可靠。', bullets: [] },
      ],
    } },
    { id: 'contact-process', type: 'timeline', visible: true, props: {
      eyebrow: '服务流程 · SERVICE PROCESS',
      title: ['四步搞定', '售后申请'],
      desc: '从提交申请到问题解决，全程透明高效，客服一对一跟进。',
      theme: 'paper',
      items: [
        { year: 'STEP 01 · 提交申请', title: '填写售后申请表单', text: '通过下方表单提交产品型号、序列号与问题描述，或拨打 400-898-1868 电话报修。' },
        { year: 'STEP 02 · 客服确认', title: '1 个工作日内响应', text: '客服将在 1 个工作日内联系您核实信息，确认故障情况与质保资格，并告知处理方案。' },
        { year: 'STEP 03 · 寄修 / 换新', title: '按方案寄修或直接换新', text: '符合只换不修政策的产品直接安排换新；需寄修产品提供寄修地址与物流指引，运费按政策承担。' },
        { year: 'STEP 04 · 处理完成', title: '检测处理 · 原路返回', text: '收到产品后完成检测与处理，合格品原路寄回或发出换新产品，全程可查。' },
      ],
    } },
    { id: 'contact-faq', type: 'faq-list', visible: true, props: {
      eyebrow: '常见问题 · FAQ',
      title: ['你可能想问的', '都在这里'],
      desc: '关于质保、退换、维修的常见疑问，这里先给你答案。',
      category: '',
    } },
    { id: 'contact-form', type: 'contact-form', visible: true, props: {
      infoTitle: '联系售后',
      infoItems: [
        { icon: '⌂', label: 'ADDRESS · 公司地址', lines: ['北京市海淀区中关村大街 19 号', '新中关购物中心 B 座北翼 5A 层办公 B5A01'] },
        { icon: '✉', label: 'EMAIL · 售后邮箱', lines: ['info@centremix.com'] },
        { icon: '☏', label: 'PHONE · 服务热线', lines: ['400-898-1868', '010-62887359'] },
        { icon: '⌚', label: 'SUPPORT · 服务时间', lines: ['工作日 9:00 - 18:00', '法定节假日顺延'] },
        { icon: '✦', label: 'CHANNEL · 购买渠道', lines: ['天猫旗舰店 · 京东自营 · 全国渠道伙伴'] },
      ],
      formTitle: '售后申请 / 保修登记',
      formDesc: '填写以下表单并提交，我们的售后团队将在 1 个工作日内与您联系。',
      typeOptions: ['性能故障 / 无法识别', '读写异常 / 掉速', '外观 / 接口损坏', '换新申请', '其他'],
      agreeText: '我已阅读并同意《隐私政策》，授权 Centremix 芯联创使用上述信息为我提供售后服务。',
      submitText: '提交售后申请 →',
    } },
    { id: 'contact-cta', type: 'cta-banner', visible: true, props: {
      title: '关注品牌动态',
      desc: '留下您的联系方式，第一时间获取 Centremix 芯联创的新品资讯与技术动态。',
      btnText: '查看新闻咨询 →', btnLink: '/news',
    } },
  ],
};

/** 取某页面的默认区块兜底副本（深拷贝，避免调用方修改污染常量） */
export function defaultBlocks(slug: string): Block[] {
  const list = DEFAULT_BLOCKS[slug];
  return list ? JSON.parse(JSON.stringify(list)) : [];
}
