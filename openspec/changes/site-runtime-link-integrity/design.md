## Context

> 2026-11-08 修订：需求方确认「按是否装修对页面分类，允许运营在顶部 tab 新增一级页面，固定一级页不可删、新增一级页可删」，并选定 **A 方案 `/:slug` 软通配**。原 D1「地址封闭 10 条、不开放新建页面」整体作废，本文件按新口径重写。

规则确定（本 change 的输入，已与需求方逐条确认）：官网路由记录的**形态**由代码固定，地址实例由 `pages` 表中已发布的一级页面决定；页面按「是否装修」分为一级装修页与二级动态详情页；固定一级页不可删除，运营新增的一级页可以删除；导航菜单只管理顶栏的名称与显隐（新增页 tab 行由页面流程内部产生）；页脚写回代码；产品与资讯详情各用一条独立地址（`/product/:slug`、`/article/:slug`），两条链各自闭环。

### 页面分类（本 change 的核心输入）

| 类别 | 页面 | 地址 | 装修 | 链接 | 删除 |
|---|---|---|---|---|---|
| **一级 · 固定** | 首页、关于、产品、资讯、联系（5 条） | `/`、`/about`、`/products`、`/news`、`/contact` | 需要 | 代码固定 | **不可删除** |
| **一级 · 新增** | 顶部 tab 新增的页面（N 条） | `/:slug` 软通配产生，形如 `/cases` | 需要 | 随 `pages` 记录变化 | **可删除** |
| **二级 · 动态** | 产品详情、资讯详情 | `/product/:slug`、`/article/:slug` | **不需要** | 随条目标识变化，由代码生成 | 不进 `pages` 表（下线的是条目，不是页面） |
| 辅助 / 门控 | `/search`、`/login`、404、`/preview/:slug` | 固定 | 不需要 | 固定或登录门控 | — |

二级页与一级页彻底隔离：二级详情取 `products` / `articles` 表，不出现在装修列表、无「装修 / 预览草稿」入口；站内详情链接一律由代码生成（第 4 组），运营不能手敲。

### 路由统计（改造前 → 改造后）

**官网开放路由（无需登录）**

| 改造前 | 改造后 | 说明 |
|---|---|---|
| `/` → Home.vue | `/` 保留 | 一级固定，装修 `slug=home` |
| `/about` → About.vue | `/about` 保留 | 一级固定，`slug=about`，导航名可改为「公司介绍」 |
| `/products` → Products.vue | `/products` 保留 | 一级固定，`slug=products` |
| `/news` → News.vue | `/news` 保留 | 一级固定，`slug=news` |
| `/contact` → Contact.vue | `/contact` 保留 | 一级固定，`slug=contact` |
| — | **新增 `/:slug` → CmsPage.vue** | **A 方案**：一级新增页的软通配记录，置于 `:pathMatch(.*)*` 之前；命中 `pages.status=1` 才渲染，否则品牌化 404 |
| `/products/:slug` → ProductDetail.vue | **改为 `/product/:slug`** | 二级动态，指向 `views/website/products/detail.vue` |
| `/news/:slug` → Article.vue | **改为 `/article/:slug`** | 二级动态，指向 `views/website/news/detail.vue` |
| `/search` → Search.vue | `/search` 保留 | 辅助功能页，移除会断搜索（见 Open Questions） |
| `/login` → Login.vue | `/login` 保留 | 全屏独立，不套官网 Layout |
| `/:pathMatch(.*)*` → NotFound.vue | 保留 | 品牌化 404，在官网 Layout 内 |

改造后开放路由 **11 条**（5 个固定一级页 + 1 条一级新增页软通配 + 2 条独立详情 + 搜索 + 登录 + 404 兜底）。**注意口径变化**：可枚举的是 11 条路由记录形态，不再是 11 个具体地址；`/:slug` 下实际存在哪些地址由 `pages` 数据决定，治理手段是保留字表（D8）而非路由白名单。

**登录门控的官网地址（非开放路由）**

| 地址 | 处置 | 说明 |
|---|---|---|
| `/preview/:slug` → Preview.vue（[router/index.ts:29](../../../buinessweb/src/router/index.ts) `meta.requiresAuth`） | 保留 | 装修编辑器「预览草稿 ↗」的落点，在官网 Layout 内渲染 `draft_json`；守卫未登录跳 `/login?redirect=`。它不是公开地址，因此不受「未发布即 404」约束，但官网任何位置不得出现指向它的链接 |

**管理端路由（`requiresAuth: true`）**：`/admin` 下 16 条——13 条在侧栏可见（页面列表、产品管理、产品分类、资讯管理、资讯分类、Banner、导航菜单、站点设置、FAQ、线索、素材库、用户、审计），3 条隐藏页（装修编辑器、产品编辑、资讯编辑，靠 `meta.activeMenu` 高亮）。侧栏数据源是硬编码 [adminMenu.ts](../../../buinessweb/src/stores/adminMenu.ts)，**与 `menus` 表无关**，本 change 明确这条边界不许再模糊。

三类地址合计即前端路由表全部条目：开放 11 条 + 登录门控 1 条 + 管理端 16 条。表外条目仍然不允许，但「新增一级页地址」不再需要开发改路由表与代码评审，改由保留字 + 发布状态约束。

### 既有事实与约束（2026-11-08 复核）

- 后端只静态服务 `/uploads`，不托管 SPA（[backend/src/app.ts:24-25](../../../backend/src/app.ts)）；`vite.config.ts` 只有 proxy，仓库内无生产 `try_files` / `historyApiFallback` 配置——**所有方案的刷新直链都依赖部署层回 index.html**，A 方案不改变这一前提
- `/public/pages/:slug` 按任意 slug 查 `status=1`，查不到返回 `200 + data:null`，并带 `no-cache` + ETag（[public.ts:209-220](../../../backend/src/routes/public.ts)）；该契约天然适配软通配，取数层零改造
- `usePageBlocks` 目前拿空数组即保留 `defaultBlocks`——「下线页面官网照旧显示」的成因，也是 D8 的硬前提
- `pages` 表（[schema.sql:132-148](../../../backend/sql/schema.sql)）**没有任何类型或固定标记**；`DELETE /pages/:id`（[content.ts:284](../../../backend/src/routes/content.ts)）无拦截；后台删除按钮（[pages/index.vue:135](../../../buinessweb/src/views/admin/website/pages/index.vue)）对所有行开放——现状连 `about` 都能删
- 后台「新建页面」目前是自由填 slug（`POST /pages` 的 zod 仅 `min(1).max(80)`），接口层其实已能造出一级新增页，缺的只是前端路由接住与删除门禁
- `editor.vue:523` 的「查看线上」已按 `` slug === 'home' ? '/' : `/${slug}` `` 拼接，A 方案下零改动
- 前端为 `vue-router ^5.0.4`；`main.ts` 是同步 `app.mount('#app')`，无 `router.isReady()` 引导；官网 Layout 父路由无 `name`（影响 C 方案的 `addRoute(parentName, …)`）
- `menus` 现有 12 行：顶栏 5 + `关于品牌 → /option`（id=6，header）+ CTA 1（id=7）+ 页脚 2 分组带 8 子项
- 本 change 已先行落地：`menus.location` 迁移 004、`/public/site` 的 `no-cache` + 内容指纹 ETag、`WebsiteLayout.vue` 三区数据驱动、`stores/site.ts` 的 `ensureLoaded(force)`、`vue-tsc` 通过。其中页脚数据驱动与子项下拉**按新规则要回退**，`/public/site` 缓存与顶栏取数保留。

## Goals / Non-Goals

**Goals:**

- 官网页面按「一级装修页 / 二级动态详情页」分类，二级页不进装修体系、链接由代码按标识生成
- 路由记录形态封闭、可核对；一级新增页的地址由后台配置产生，运营配置不出发保留字与格式边界
- 固定一级页不可删除，运营新增的一级页可删除；固定导航六行不可删改链，新增页 tab 行随页面生命周期增删
- 产品与资讯详情各用一条独立地址，两套内容分处两个功能目录、互不引用
- 前台显示的与后台发布的严格一致：未发布、空内容、已删除、条目下线一律品牌化 404

**Non-Goals:**

- 不做运行时动态路由注册（`addRoute`）、不做多级自定义路径、不做 `/p/:slug` 形态、不做旧路径 301
- 不做导航子项、拖拽排序、位置切换 UI；不向运营开放独立的「新增导航项」入口
- 不做详情页 SEO 结构化数据与 OG 标签
- 不改装修区块模型与发布流程（`page-publication-approval`）、不改编辑器交互（`decoration-editor-toolkit`）

## Decisions

### D1 页面分三类，一级新增页用 `/:slug` 软通配（取代原「作废运营自助新建」）

**原决策作废**：地址由代码注册为封闭 10 条、`POST /pages` 限死五个 slug、后台新建收敛为固定集合选择、上一版 `/p/:slug` + 301 + `CmsPage.vue` 提案整体退场——这套口径与需求方 2026-11-08 确认的分类模型冲突，全部替换。

**核心让步**：地址集合不再是代码可枚举的封闭集合，而是「**路由记录形态封闭 + 地址实例由 `pages.status=1` 数据决定**」。路由表只新增 1 条 `/:slug`（开放 11 条），其余 10 条不变；允许的地址范围由保留字表（D8）与发布状态共同治理。

**三处落地点**：

1. 前端 `src/router/index.ts`：在官网 Layout children 的 `:pathMatch(.*)*` **之前**加 `{ path: ':slug', name: 'dynamic-page', component: CmsPage.vue }`。`CmsPage.vue` 复用 `SectionRenderer` + `usePageBlocks(slug)`，三态表现见 D6 / D8。
2. 后端 `POST /pages`：slug 校验从「五值白名单」改为「格式 + 保留字 + 固定页不可覆盖」；`DELETE /pages/:id` 增加 `is_fixed` 拦截（D9）。
3. 后台 `views/admin/website/pages/index.vue`：新建页面开放（带格式与保留字校验），列表区分「固定 / 新增」，删除按钮按 `is_fixed` 禁用。

**匹配顺序与边界**（vue-router v5 沿用静态段 > 参数段 > 可重复通配的排序）：`/about` 命中静态记录，不被 `/:slug` 抢；`/cases` 命中软通配 → 查 `pages`；`/product/p1` 命中两段详情记录；`/product`（缺标识）命中 `:slug` 且查无记录 → 404，正好满足原 spec「缺标识不回落列表页」；`/login` 为顶层静态记录优先。实现时补一条路由单测，覆盖 `/about`、`/cases`、`/product/p1`、`/product`、`/option` 五条落点。

**被否决的替代方案**：

- **B `/p/:slug` 形态固定**——地址形态不统一（`/about` vs `/p/cases`），面包屑与导航高亮要特例，`editor.vue:523`、新建表单提示、导航行生成三处链接都要改，且正是上一版被否决的形态。仅在「路由统计表必须严格可枚举」升级为硬约束时才回退到此方案。
- **C 运行时 `addRoute()`**——父路由当前无 `name`、`main.ts` 同步挂载无 `isReady()` 引导、删页必须 `removeRoute` 否则出现幽灵路由、首屏多一次串行请求且失败会整站白屏。仅为「运营自定义多级路径」才值得，与「tab 新增一个页面」的诉求复杂度不匹配。
- **完全自由新增**（无格式校验、无保留字）——正是 `/option` 死链的成因，否决。

**代价与共识**：保留字表从「可选优化」变成必需治理；二级页与一级新增页彻底隔离；`product` / `article` / `option` 等词禁止被占用，否则死链复活或语义混乱。

### D2 两条独立详情路由，实现按功能目录各自落地

`/product/:slug`（name `product-detail`）与 `/article/:slug`（name `article-detail`）是两条互不相干的记录，各自指向 `views/website/products/detail.vue` 与 `views/website/news/detail.vue`；两条链的字段、样式、面包屑与取数分别维护，共用件只有接口客户端、类型与区块渲染器。这两个文件由 `ProductDetail.vue` 与 `Article.vue` 迁移改名而来：**路由记录的增删归本 change（第 3 组），文件迁移与去占位、三态分离等改造归 `product-content-flow` 与 `article-content-flow`**。按新分类它们是**二级动态页**：不进 `pages` 表、不参与装修、链接随条目标识变化。

替代方案与否决理由：

- **合并成单一 `Option.vue` 双套渲染**（本 change 更早版本的选择）——两个详情页的字段区与样式差异不小（420px 头图栅格 vs 860px 单栏正文），长期在同一文件里交织，与「四个独立功能目录、互不引用」的结构要求冲突。
- **`/option/:type/:slug` 一条形态、两个组件**（上一版的选择）——地址统一，但 `type` 段是两条链的共享约定：新增第三类内容必须先改类型白名单，两链的地址规则绑在同一份 spec 上，与「两条链各自闭环」冲突。
- **`/option/product/:slug` + `/option/article/:slug`（同一前缀拆两条记录）**——与上一版已定的统一形态同源、引用改写量最小；但 `/option` 前缀无语义，两条链仍共用一段痕迹，需求方明确选择形态可读的独立地址。
- **保留旧的 `/products/:slug` 与 `/news/:slug`**——零迁移零改写，代价是列表与详情同段嵌套（`/products` 与 `/products/:slug`），面包屑与导航高亮判定要特例处理。

命名风险与缓解：`/product/:slug` 与列表 `/products` 只差一个字母，错拼必须落进兜底 404 而不是半渲染页——由形态白名单与保留字表守住；站内详情链接一律由代码生成（第 4 组），不靠运营手敲。`/article/:slug` 与列表 `/news` 词根不一致，属同类风险，同样由保留字与代码生成兜住。

### D3 旧详情地址直接 404，引用改写用后端脚本

按你的选择：`/products/p1`、`/news/a1` 不再自动跳转。真正的风险在**站内自引用**——装修区块 props 里存着 `/products/xxx`、`/news/xxx` 形态的链接（`SecPosterGrid` 的 `items[].link`、`SecHero` 的 `cta1.link` 等，见 [sectionRegistry.ts](../../../buinessweb/src/website/sectionRegistry.ts)），以及 SQL 种子里的默认值。

改写不采用 SQL 文本替换（JSONB 里做正则替换脆弱且不可回滚），改为一次性 node 脚本：读取 `pages.content_json`/`draft_json`，把 `^/products/(.+)$` 改成 `/product/$1`、`^/news/(.+)$` 改成 `/article/$1`，逐行写回并输出改写清单供核对。产品/资讯列表组件里的 `router-link` 目标由代码统一改造。两处改写（数据脚本 + 组件跳转）都归本 change 第 4 组一次做完，`product-content-flow`、`article-content-flow` 只在各自任务里核对与同批发布，不重复改同一批链接。

### D4 导航分「固定六行」与「新增页 tab 行」两类

原 D4「移除 `POST` / `DELETE /menus`」按新口径调整，因为一级新增页要占顶栏一行：

- **固定六行**（header 5 + CTA 1）：仍以 url 为身份，`PATCH` **仅** `title` / `status` 生效；出现 `url` / `location` / `target` / `parentId` / `sort` 且与库中值不同即 400；`DELETE` 对这六行一律 400「固定导航项不可删除」；不可新增同名行。
- **新增页 tab 行**：由页面创建 / 删除流程在**后端内部**生成与清理，不向运营开放独立的「新增导航项」入口；url 固定为 `/{page.slug}`，运营同样只能改名与显隐，不能改链接、位置、打开方式、加子项。删除页面时级联清理对应导航行，避免留下死链。
- `/menus/reorder` 仍从路由注册中移除：固定六行顺序不变，新增行按创建顺序追加。
- `GET /menus`（管理端）返回固定六行 + 新增页 tab 行的单层列表，不再构树、不返回页脚行。
- 不做破坏性 DDL：`location`、`parent_id`、`sort`、`url` 列保留；两类行按 url 是否属于固定集合派生区分（见 D9），回滚只需恢复接口与前端逻辑。

### D5 页脚写回代码，站点配置响应体收缩

`/public/site` 改为返回 `{ settings, menus(header 5 + 新增 tab 行), ctaMenu }`，**删除** `footerMenus` 字段（前后端同批发版，不留兼容垫片）。`WebsiteLayout.vue` 的页脚恢复为代码固定的两个分组 + 由 `site_settings` 驱动的联系列；顶栏去掉子项下拉分支与相应 scoped 样式。新增页 tab 行参与顶栏渲染，但不产生子项。

### D6 取消前台兜底，`pageDefaults.ts` 降级

`/public/pages/:slug` 维持 `200 + data:null` 契约不变；`usePageBlocks(slug)` 返回值增加 `state: 'ok' | 'empty' | 'error'`，`empty` → 品牌化 404，`error` → 可重试错误态。`pageDefaults.ts` 继续存在但只作为编辑器「铺默认内容 / 模板」的数据源（由 `decoration-editor-toolkit` 使用），前台链路不再 import。

**D6 是 D8 软通配的硬前提**：路由记录恒在，若不做三态，一级新增页未发布、被删除、被下线时仍会显示 `defaultBlocks`，「运营配置决定显示」就不成立。

`Preview.vue` 不走 `usePageBlocks`（它直接调管理端 `GET /pages/by-slug/:slug` 取 `draft_json`），因此三态改造天然不影响草稿预览；这一点在实现时不要顺手把预览页也接进 `usePageBlocks`，否则未发布页面将无法预览。

### D7 迁移 `007_fixed_nav_rows.sql`：只做显隐与补行，不改名称

- 确认六行存在且 `url` / `location` 正确（缺失则按种子补，`sort` 固定 1..5，CTA 单独），并给这六行打 `is_fixed=true`
- 白名单外的顶栏行 `关于品牌 → /option`（id=6）置 `status=0`：`/option` 从来不是任何路由，这一行是运营手填出来的死链（本次问题的起因）。**A 方案下该词进入保留字表**，否则库里若存在 `slug=option` 的已发布页，此死链会复活
- 页脚 10 行全部置 `status=0`（数据保留，不再被任何代码消费）
- **不改任何 `title`**：现有名称是运营自己改过的（如「联系我们」），迁移不覆盖。**唯一例外**是错别字订正——`/news` 那行的「新闻咨询」改「新闻资讯」（2026-10-29 经需求方同意破例，代码与 `schema.sql` 基线已同步订正，库里旧值靠本迁移的 `UPDATE` 收敛）
- 附反向脚本：恢复上述 `status`，删除本次补入的行
- 新增页 tab 行不受本迁移管辖，由 D9 的页面生命周期流程产生

> 注意：仓库现有迁移已到 `013_home_module_seed.sql`，007 编号存在空档。本 change **不再为 `pages` 新增任何列**（固定页由 slug 集合派生判定，见 D9），因此无需新增迁移；将来若引入其它结构变更，编号应接续 013，不要回填 007 造成已执行库的时间线混乱。

### D8 A 方案软通配的技术口径

- **保留字表**：`home|about|products|news|contact|product|article|search|login|preview|admin|option|p|404`；slug 格式 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。已落地为前后端两份常量——`backend/src/routes/content.ts` 与 `buinessweb/src/website/pageRoutes.ts`（后者同时提供 `pagePath` / `isFixedPage` / `validatePageSlug`），两处注释要求同步改动。`option` 必须入表（见 D7）。
- **取数不另起炉灶**：`CmsPage.vue` 直接 `usePageBlocks(String(route.params.slug))`，`GET /public/pages/:slug` 的 `200 + data:null` 契约零改造；`state=empty` 渲染品牌化 404、`state=error` 渲染可重试错误态。
- **标题闪烁**：`router.afterEach` 先写默认标题、再由 `applyPageSeo` 覆盖会有一帧闪烁；给 `:slug` 记录不设 `meta.title`，由 `usePageBlocks` 在加载完成后一次性写入。
- **链接生成零改动**：`editor.vue:523` 已按 `` slug === 'home' ? '/' : `/${slug}` `` 拼接；B / C 方案都要改这一处。
- **多余请求**：未知单段路径（含 `/option`）会多一次 `GET /public/pages/:slug`；前端可先用 slug 格式过滤明显非法形态，404 结果不变。
- **不做运行时注册**：`main.ts` 保持同步挂载；v5 虽提供 `addRoute` / `removeRoute` 与实验性文件路由，但前者改动面过大、后者是构建期生成，都不解决运营运行时新增。
- **软通配记录位置**：必须注册在 `:pathMatch(.*)*` 之前；虽 matcher 排序会让静态记录优先，显式顺序更利于走查。

### D9 固定一级页不可删、新增一级页可删（2026-11-09 实现口径修订）

**不加 `is_fixed` 列，改由固定 slug 集合派生判定**。原计划给 `pages` 加布尔列的方案作废，理由：「地址是否固定」的真相在前端路由表里，数据库标记只会制造第二份真相；且代码会在迁移未执行的库上直接报错。固定一级页集合即 `FIXED_PAGE_SLUGS = home/about/products/news/contact`，前后端各一份常量并注释要求同步。

- 服务端：`DELETE /pages/:id` 先查 slug，命中固定集合即 400「官网固定页面…不可删除；需要暂时隐藏请使用『下线』」；非固定页在同一事务内删 `pages` 行 + 清理 `location='header' AND url='/{slug}'` 的顶层行，并写 `audit_logs`。`PATCH /pages/:id` 本就不接受 slug，无需额外拦截。`POST /pages` 走 D8 的格式与保留字校验。
- 前端：页面列表用 `isFixedPage(slug)` 渲染「固定 / 新增」标签、禁用固定页删除按钮，并在 `remove()` 内再拦一道；提示条说明固定页由代码维护。
- 入口收敛：「新建页面」是新增顶部 tab 的**唯一入口**；导航菜单页移除顶栏/CTA 的新增与删除按钮，表头与提示条引导到页面装修。header/CTA 的编辑弹窗只提交 `title` + `status`，链接/打开方式/排序置为只读。
- 二级页无删除概念：下线的是内容条目，访问落品牌化 404；`product` / `article` 进保留字，禁止被建成一级页。

## Risks / Trade-offs

- [地址集合不再由代码完全可枚举] → 已接受的口径让步；治理手段改为「11 条路由形态 + 保留字表 + `pages.status`」，验证清单需覆盖「保留字不可占用」「新增页删除后 404」
- [`/option` 死链可能复活] → `option` 进保留字表，并在迁移中确认不存在 `slug=option` 的已发布页；这是本次问题的直接起因，必须列入验收
- [未知单段路径多一次 DB 查询、标题有一帧闪烁] → 前端格式预过滤 + 标题由取数完成后一次性写入；不改变 404 结果
- [旧详情地址被外部收录，直接 404 会掉流量] → 已确认接受；缓解手段是把改写清单做全（站内引用零残留），后续如需兼容跳转另开 change
- [详情实现迁移到新目录时回归面集中] → 先并行验证（旧路径与新地址同时可访问一段时间），走查产品与资讯两类字段无误后再移除旧路由记录；`git mv` 保留文件历史便于对照
- [固定六行可被全部隐藏，官网导航看起来消失] → 允许（运营自由），界面在隐藏最后一项时给出明确提示；不做硬性下限校验
- [固定行 DELETE 被拒后，未同步升级的旧后台按钮会报错] → 前后端同一发布窗口；后台按钮在同批改造中按 `is_fixed` 禁用
- [新增页删除后，外链与已打开页面仍可能访问] → A 方案天然处理：取数返回 `null` 即 404，无需 `removeRoute`；不做 301 与跳转
- [页脚菜单行只是隐藏，将来若重开配置能力会留下僵尸数据] → 迁移注释写明用途与反向脚本；不做物理删除以保住可恢复性
- [`/search` 保留在你清单之外] → 明确按「开放功能页」保留；若要收进 404，只需删一条路由与一个入口（已在 Open Questions 列出）

## Migration Plan

1. 数据：执行 `007_fixed_nav_rows.sql`（幂等）。**无需新增列或迁移**——固定页由 `FIXED_PAGE_SLUGS` 派生判定（D9），新增一级页与顶栏 tab 行由 `POST /pages` 在同一事务内写入。
2. 后端：`POST /pages` 改格式 + 保留字 + 固定页不可覆盖校验，并事务内联动建 header tab 行；`DELETE /pages/:id` 拦截固定页并级联清理 tab 行；`/menus` 按 D4 分两类收窄（固定行禁删禁改链、新增 tab 行由页面流程内部增删）；`/public/site` 响应收缩去掉 `footerMenus`。
3. 前端官网：`src/router/index.ts` 在兜底前加 `/:slug` → `CmsPage.vue`；新增 `/product/:slug` 与 `/article/:slug` 两条记录（目录重组与详情改造分别由 `product-content-flow`、`article-content-flow` 交付）、移除旧两条详情路由；`usePageBlocks` 三态与严格 404（D6，优先于软通配上线）；`WebsiteLayout.vue` 顶栏去子项、页脚代码化；区块与组件内旧详情链接改写；`/preview/:slug` 原地保留。
4. 前端后台：导航菜单页改为「固定六行 + 新增 tab 行」单层列表，只读字段禁用；页面列表开放新建（格式/保留字校验）、区分固定与新增标签、删除按钮按 `is_fixed` 禁用；保存成功后 `ensureLoaded(true)`。
5. 一次性脚本改写 `pages` 里的旧详情链接，输出清单核对。
6. 验证：按两份 spec 场景走查（需按新口径重写场景，见下）+ 路由落点单测（`/about`、`/cases`、`/product/p1`、`/product`、`/option`）+ 保留字与固定页删除门禁 + 新增页「创建 → 配置 → 发布 → 显示 → 删除 → 404」全链路 + 路由表与统计表逐条比对 + 两端类型检查。

回滚：前端 `git revert` 本批提交（删 `/:slug` 记录与 `CmsPage.vue`、恢复页面列表与导航菜单页入口）；数据侧执行 007 反向脚本恢复导航行 status，并按需清理本批新建页面产生的 `pages` / `menus` 行；接口回滚即恢复原有校验与路由注册。**本次无 schema 变更**。

## 文档同步状态（2026-11-09 已完成）

本目录 5 份文档已按 A 方案与「**允许运营新建一级页面、不再禁止新建**」的口径同步，无旧口径残留：

- `proposal.md` — Why 改为「页面与导航两套数据不联动」；What Changes 写明允许新建、页面分类、事务联动建 tab；BREAKING 收敛为 3 处；Impact 更新到实际文件
- `specs/page-routing/spec.md` — 8 项要求 / 29 个场景；删除「后台不能造出新地址」「仅五个 slug 存在」，新增「新建一级页生成地址与栏目」「保留字拦截」「固定页不可删」「新增页可删并清理栏目」
- `specs/site-navigation/spec.md` — 7 项要求 / 19 个场景；固定六行与新增 tab 行分两类，明确「导航菜单页不提供新增入口，但不是禁止新建页面」
- `tasks.md` — 9 组；1.9 / 7.8 / 8.7 等条目改口径，新增第 9 组登记 2026-11-09 已落地项
- `README.md` — 规则口径、关键交付物（开放 11 条 / D1–D9）、落地状态与待办清单

## Open Questions

- 保留字表目前是前后端各一份常量（靠注释约束同步），是否改为由后端 `/public/site` 单点下发以避免漂移
- 新增一级页当前固定同时创建顶栏 tab 行，是否允许创建后隐藏 / 不进导航
- 新增一级页的 slug 创建后是否允许修改（建议禁止，避免外链失效；如允许需同步改写导航行与站内引用）
- `/search` 是否确认留在开放路由中（当前按保留处理）
- `/product`、`/article` 两个不带 slug 的段：A 方案下由 `/:slug` 接住并查无记录 → 品牌化 404，是否确认按此口径写入 spec（不再作为待定问题）
- 详情页是否需要 `robots` / OG 与 sitemap——本 change 明确不做，若收录压力大另开
