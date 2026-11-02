## Context

规则确定（本 change 的输入，已与需求方逐条确认）：官网地址是封闭集合；导航菜单只管理顶栏的名称与显隐；页脚写回代码；产品与资讯详情各用一条独立地址（`/product/:slug`、`/article/:slug`），两条链各自闭环；不开放新建页面。

### 路由统计（改造前 → 改造后）

**官网开放路由（无需登录）**

| 改造前 | 改造后 | 说明 |
|---|---|---|
| `/` → Home.vue | `/` 保留 | 装修 `slug=home` |
| `/about` → About.vue | `/about` 保留 | `slug=about`，导航名可改为「公司介绍」 |
| `/products` → Products.vue | `/products` 保留 | `slug=products`，「产品介绍」 |
| `/news` → News.vue | `/news` 保留 | `slug=news`，「新闻资讯」 |
| `/contact` → Contact.vue | `/contact` 保留 | `slug=contact`，「联系我们」 |
| `/products/:slug` → ProductDetail.vue | **改为 `/product/:slug`** | 产品详情独立路由，指向 `views/website/products/detail.vue` |
| `/news/:slug` → Article.vue | **改为 `/article/:slug`** | 资讯详情独立路由，指向 `views/website/news/detail.vue` |
| `/search` → Search.vue | `/search` 保留 | 你列的清单未含它，但移除会断搜索，故保留（见 Open Questions） |
| `/login` → Login.vue | `/login` 保留 | 全屏独立，不套官网 Layout |
| `/:pathMatch(.*)*` → NotFound.vue | 保留 | 品牌化 404，在官网 Layout 内 |

改造后开放地址 **10 条**（5 装修页 + 2 条独立详情 + 搜索 + 登录 + 404 兜底）。

**登录门控的官网地址（非开放路由）**

| 地址 | 处置 | 说明 |
|---|---|---|
| `/preview/:slug` → Preview.vue（[router/index.ts:25](../../../buinessweb/src/router/index.ts) `meta.requiresAuth`） | 保留 | 装修编辑器「预览草稿 ↗」的落点，在官网 Layout 内渲染 `draft_json`；守卫未登录跳 `/login?redirect=`。它不是公开地址，因此不受「未发布即 404」约束，但官网任何位置不得出现指向它的链接 |

**管理端路由（`requiresAuth: true`）**：`/admin` 下 16 条——13 条在侧栏可见（页面列表、产品管理、产品分类、资讯管理、资讯分类、Banner、导航菜单、站点设置、FAQ、线索、素材库、用户、审计），3 条隐藏页（装修编辑器、产品编辑、资讯编辑，靠 `meta.activeMenu` 高亮）。侧栏数据源是硬编码 [adminMenu.ts](../../../buinessweb/src/stores/adminMenu.ts)，**与 `menus` 表无关**，本 change 明确这条边界不许再模糊。

三类地址合计即前端路由表全部条目：开放 10 条 + 登录门控 1 条 + 管理端 16 条。任何新增地址必须走代码评审，不属于运营可配置范围。

### 既有事实与约束

- 后端只静态服务 `/uploads`，不托管 SPA（[backend/src/app.ts:24-25](../../../backend/src/app.ts)）
- `/public/pages/:slug` 只查 `status=1`，查不到返回 `200 + data:null`（[backend/src/routes/public.ts:140-151](../../../backend/src/routes/public.ts)）；`usePageBlocks` 拿空数组即保留 `defaultBlocks`——「下线页面官网照旧显示」的成因
- `menus` 现有 12 行：顶栏 5 + `关于品牌 → /option`（id=6，header）+ CTA 1（id=7）+ 页脚 2 分组带 8 子项
- 本 change 已先行落地：`menus.location` 迁移 004、`/public/site` 的 `no-cache`+内容指纹 ETag、`WebsiteLayout.vue` 三区数据驱动、`stores/site.ts` 的 `ensureLoaded(force)`、`vue-tsc` 通过。其中页脚数据驱动与子项下拉**按新规则要回退**，`/public/site` 缓存与顶栏取数保留。

## Goals / Non-Goals

**Goals:**

- 官网地址封闭、可枚举、可核对，运营无法配置出死链
- 导航菜单职责收窄到「改名 + 隐藏」，其余一律只读
- 产品与资讯详情各用一条独立地址，两套内容分处两个功能目录、互不引用
- 前台显示的与后台发布的严格一致

**Non-Goals:**

- 不做 `/p/:slug` 通配、不做旧路径 301、不做页面自助新建（上一版提案的这部分作废）
- 不做导航子项、拖拽排序、位置切换 UI
- 不做详情页 SEO 结构化数据与 OG 标签
- 不改装修区块模型与发布流程（`page-publication-approval`）、不改编辑器交互（`decoration-editor-toolkit`）

## Decisions

### D1 路由固定白名单，作废「运营自助新建页面」

采纳你的决定：地址由代码注册，白名单外的配置一律非法。上一版 `/p/:slug` + 301 + `CmsPage.vue` 的提案整体退场。

落地点是两处而非一处：前端路由表（`src/router/index.ts`）与后端 `POST /pages` 的 slug 校验——只改前端的话，运营仍能在库里建出无地址的僵尸页（正是 `/option` 那次的成因）；后台「新建页面」入口相应收敛为从固定集合中选择。

被否决的替代方案：保留通配路由但导航不开放新增（两套地址语义并存，正是本次要消灭的东西）；完全自助新增（与「路由固定」直接冲突）。

代价与共识：将来真要活动页/案例页，需要开发同时加路由与导航行——这是可接受的，因为它是**低频且需要评审**的动作。

### D2 两条独立详情路由，实现按功能目录各自落地

`/product/:slug`（name `product-detail`）与 `/article/:slug`（name `article-detail`）是两条互不相干的记录，各自指向 `views/website/products/detail.vue` 与 `views/website/news/detail.vue`；两条链的字段、样式、面包屑与取数分别维护，共用件只有接口客户端、类型与区块渲染器。这两个文件由 `ProductDetail.vue` 与 `Article.vue` 迁移改名而来：**路由记录的增删归本 change（第 3 组），文件迁移与去占位、三态分离等改造归 `product-content-flow` 与 `article-content-flow`**。

替代方案与否决理由：

- **合并成单一 `Option.vue` 双套渲染**（本 change 更早版本的选择）——两个详情页的字段区与样式差异不小（420px 头图栅格 vs 860px 单栏正文），长期在同一文件里交织，与「四个独立功能目录、互不引用」的结构要求冲突。
- **`/option/:type/:slug` 一条形态、两个组件**（上一版的选择）——地址统一，但 `type` 段是两条链的共享约定：新增第三类内容必须先改类型白名单，两链的地址规则绑在同一份 spec 上，与「两条链各自闭环」冲突。
- **`/option/product/:slug` + `/option/article/:slug`（同一前缀拆两条记录）**——与上一版已定的统一形态同源、引用改写量最小；但 `/option` 前缀无语义，两条链仍共用一段痕迹，用户明确选择形态可读的独立地址。
- **保留旧的 `/products/:slug` 与 `/news/:slug`**——零迁移零改写，代价是列表与详情同段嵌套（`/products` 与 `/products/:slug`），面包屑与导航高亮判定要特例处理。

命名风险与缓解：`/product/:slug` 与列表 `/products` 只差一个字母，错拼必须落进兜底 404 而不是半渲染页——这正是 D1 固定白名单要守住的；站内详情链接一律由代码生成（第 4 组），不靠运营手敲。`/article/:slug` 与列表 `/news` 词根不一致，属同类风险，同样由白名单与代码生成兜住。

### D3 旧详情地址直接 404，引用改写用后端脚本

按你的选择：`/products/p1`、`/news/a1` 不再自动跳转。真正的风险在**站内自引用**——装修区块 props 里存着 `/products/xxx`、`/news/xxx` 形态的链接（`SecPosterGrid` 的 `items[].link`、`SecHero` 的 `cta1.link` 等，见 [sectionRegistry.ts](../../../buinessweb/src/website/sectionRegistry.ts)），以及 SQL 种子里的默认值。

改写不采用 SQL 文本替换（JSONB 里做正则替换脆弱且不可回滚），改为一次性 node 脚本：读取 `pages.content_json`/`draft_json`，把 `^/products/(.+)$` 改成 `/product/$1`、`^/news/(.+)$` 改成 `/article/$1`，逐行写回并输出改写清单供核对。产品/资讯列表组件里的 `router-link` 目标由代码统一改造。两处改写（数据脚本 + 组件跳转）都归本 change 第 4 组一次做完，`product-content-flow`、`article-content-flow` 只在各自任务里核对与同批发布，不重复改同一批链接。

### D4 导航六行以 url 为身份，服务端把接口面收窄

`/menus` 只保留 `GET`（返回 header 5 行 + cta 1 行，单层）与 `PATCH /menus/:id`（**仅** `title`、`status` 生效；出现 `url`/`location`/`target`/`parentId`/`sort` 且与库中值不同即 400）。`POST`、`DELETE`、`/menus/reorder` 从路由注册中移除。

不做破坏性 DDL：`location`、`parent_id`、`sort`、`url` 列全部保留，只是接口与 UI 不再开放——回滚只需恢复路由注册。

### D5 页脚写回代码，站点配置响应体收缩

`/public/site` 改为返回 `{ settings, menus(header 5), ctaMenu }`，**删除** `footerMenus` 字段（前后端同批发版，不留兼容垫片）。`WebsiteLayout.vue` 的页脚恢复为代码固定的两个分组 + 由 `site_settings` 驱动的联系列；顶栏去掉子项下拉分支与相应 scoped 样式。

### D6 取消前台兜底，`pageDefaults.ts` 降级

`/public/pages/:slug` 维持 `200 + data:null` 契约不变；`usePageBlocks(slug)` 返回值增加 `state: 'ok' | 'empty' | 'error'`，`empty` → 品牌化 404，`error` → 可重试错误态。`pageDefaults.ts` 继续存在但只作为编辑器「铺默认内容 / 模板」的数据源（由 `decoration-editor-toolkit` 使用），前台链路不再 import。

`Preview.vue` 不走 `usePageBlocks`（它直接调管理端 `GET /pages/by-slug/:slug` 取 `draft_json`），因此三态改造天然不影响草稿预览；这一点在实现时不要顺手把预览页也接进 `usePageBlocks`，否则未发布页面将无法预览。

### D7 迁移 `007_fixed_nav_rows.sql`：只做显隐与补行，不改名称

- 确认六行存在且 `url`/`location` 正确（缺失则按种子补，`sort` 固定 1..5，CTA 单独）
- 白名单外的顶栏行 `关于品牌 → /option`（id=6）置 `status=0`：`/option` 从来不是任何路由，这一行是运营手填出来的死链（本次问题的起因）；产品与资讯的入口分别由 `/products`、`/news` 两个列表页承担，不占导航位
- 页脚 10 行全部置 `status=0`（数据保留，不再被任何代码消费）
- **不改任何 `title`**：现有名称是运营自己改过的（如「联系我们」），迁移不覆盖。**唯一例外**是错别字订正——`/news` 那行的「新闻咨询」改「新闻资讯」（2026-10-29 经需求方同意破例，代码与 `schema.sql` 基线已同步订正，库里旧值靠本迁移的 `UPDATE` 收敛）
- 附反向脚本：恢复上述 `status`，删除本次补入的行

## Risks / Trade-offs

- [旧详情地址被外部收录，直接 404 会掉流量] → 你已确认接受；缓解手段是把改写清单做全（站内引用零残留），后续如需兼容跳转另开 change
- [详情实现迁移到新目录时回归面集中] → 先并行验证（旧路径与新地址同时可访问一段时间），走查产品与资讯两类字段无误后再移除旧路由记录；`git mv` 保留文件历史便于对照
- [顶栏五项可被全部隐藏，官网导航看起来消失] → 允许（运营自由），界面在隐藏最后一项时给出明确提示；不做硬性下限校验
- [`/menus` 移除 POST/DELETE 后，未同步升级的旧后台按钮会报错] → 前后端同一发布窗口；后台按钮在同批改造中移除
- [页脚菜单行只是隐藏，将来若重开配置能力会留下僵尸数据] → 迁移注释写明用途与反向脚本；不做物理删除以保住可恢复性
- [`/search` 保留在你清单之外] → 明确按「开放功能页」保留；若你要把它收进 404，只需删一条路由与一个入口（已在 Open Questions 列出）

## Migration Plan

1. 后端：`/public/site` 响应收缩 + `/menus` 接口收窄（移除 POST/DELETE/reorder，PATCH 只放行 `title`/`status`）+ `POST /pages` 的 slug 白名单
2. 数据：执行 `007_fixed_nav_rows.sql`（幂等）
3. 前端官网：新增 `/product/:slug` 与 `/article/:slug` 两条记录各指向两个功能目录的详情组件（目录重组与详情改造分别由 `product-content-flow`、`article-content-flow` 交付，本 change 只挂地址）、旧两条详情路由移除、`usePageBlocks` 三态与严格 404、`WebsiteLayout.vue` 顶栏去子项、页脚代码化、区块与组件内旧详情链接改写；`/preview/:slug` 原地保留
4. 前端后台：导航菜单页退化为「六行 + 名称 + 显隐」，只读字段禁用，移除新增/删除/加子项/位置/链接/打开方式控件；页面列表的「新建页面」改为从固定集合中选择；保存成功后 `ensureLoaded(true)`
5. 一次性脚本改写 `pages` 里的旧详情链接，输出清单核对
6. 验证：按两份 spec 的 42 个场景走查 + 路由表与统计表逐条比对 + 两端类型检查

回滚：前端 `git revert` 本批提交（旧路由与旧详情组件随之恢复）；数据侧执行 007 反向脚本；接口回滚即恢复原有路由注册。无 schema 破坏性变更，`menus` 列全部保留。

## Open Questions

- `/search` 是否确认留在开放路由中（当前按保留处理）
- `/product`、`/article` 两个不带 slug 的段是否要友好跳转到各自列表页，当前按白名单严格处理为 404
- 详情页是否需要 `robots`/OG 与 sitemap——本 change 明确不做，若收录压力大另开
