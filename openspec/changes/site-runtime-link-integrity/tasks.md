## 1. 后端：站点配置、菜单与页面创建接口收窄

- [ ] 1.1 `/public/site` 响应改为 `{ settings, menus(header 5), ctaMenu }`，删除 `footerMenus` 字段与其树构建分支
- [ ] 1.2 `/public/site` 菜单查询限定 `location IN ('header','cta') AND status=1`，且只取顶级行（`parent_id IS NULL`）
- [ ] 1.3 保留 `no-cache` + 内容指纹 ETag 与 `304` 短路（已实现），补一条注释说明导航要求即时生效
- [ ] 1.4 `GET /menus`（管理端）只返回 header 五行与 cta 一行的单层列表，不再构树、不再返回页脚行
- [ ] 1.5 `PATCH /menus/:id` 仅接受 `title` 与 `status`；出现 `url`/`location`/`target`/`parentId`/`sort` 且与库中值不同 → 400 且不改数据
- [ ] 1.6 `title` 必填校验（trim 后非空、长度上限），`status` 仅接受 0/1
- [ ] 1.7 移除 `POST /menus`、`DELETE /menus/:id`、`/menus/reorder` 的路由注册（连同 `MENU_LOCATIONS` 相关的子项继承与级联逻辑）
- [ ] 1.8 补写导航项改名/显隐的 `audit_logs`（action `menu.update`）
- [ ] 1.9 `POST /pages`（[content.ts:105-125](../../../backend/src/routes/content.ts)）的 zod 增加 slug 白名单（仅 `home|about|products|news|contact`），`assertSlugFree` 冲突与白名单外各给明确中文文案；`DELETE /pages/:id` 保持可用但审计留痕
- [ ] 1.10 backend `npx tsc --noEmit` 通过

## 2. 数据迁移 007

- [ ] 2.1 新增 `backend/sql/migrations/007_fixed_nav_rows.sql`：确认/补建 header 五行（url `/`、`/about`、`/products`、`/news`、`/contact`，`sort` 1..5）与 cta 一行（url `/contact`），全部幂等 `WHERE NOT EXISTS`
- [ ] 2.2 迁移内**不改任何 `title`**，并在文件注释写明「名称由运营维护，迁移不覆盖」
- [ ] 2.3 白名单外的顶栏行（现状为 id=6 `关于品牌 → /option`）置 `status=0`，注释说明 `/option` 保留为详情路由不占导航位
- [ ] 2.4 页脚 10 行（两分组 + 8 子项）置 `status=0`，数据保留不删
- [ ] 2.5 附反向脚本：恢复上述行的 `status`、删除本次补入的行；注释标明执行顺序
- [ ] 2.6 同步 `backend/sql/schema.sql`：种子改为固定六行 + 页脚与子项不再播种，并在 004 相关注释处标注「007 起 footer 不再被消费」
- [ ] 2.7 在本地库执行迁移后，用查询核对结果（六行 `status=1`，其余 `status=0`）
- [ ] 2.8 错别字数据订正（2026-10-29 经需求方同意破例，是 D7「不改 title」的唯一例外）：`UPDATE menus SET title='新闻资讯' WHERE url='/news' AND title='新闻咨询'`；同时订正 `pages` 中 `slug='news'` 的 `title` 与 `content_json`/`draft_json` 里三处「新闻咨询」文案（eyebrow、crumb、btnText，与 002 种子同源）。已执行过的迁移 002/004 不回改——新环境仍会先按旧文案插入，统一由本步收敛；反向脚本把这两处改回原值

## 3. 两条独立详情路由 `/product/:slug`、`/article/:slug`

- [ ] 3.1 路由表新增 `/product/:slug`（name `product-detail`）与 `/article/:slug`（name `article-detail`），均为官网 Layout 子路由；移除 `/products/:slug` 与 `/news/:slug` 两条记录，不配任何自动跳转
- [ ] 3.2 两条记录各自指向所在功能目录的详情组件（`/product/:slug` → `views/website/products/detail.vue`，`/article/:slug` → `views/website/news/detail.vue`）；文件分别由 `ProductDetail.vue` / `Article.vue` 迁移而来，迁移动作分别在 `product-content-flow`、`article-content-flow` 的目录组，两 change 若不同批则本步先挂原文件路径
- [ ] 3.3 两条地址互不回退：`/product/:slug` 只按产品集合取数，`/article/:slug` 只按资讯集合取数，用另一类的标识访问即落品牌化 404；`/product`、`/article` 缺标识时由兜底 404 接住，不回落成列表页
- [ ] 3.4 面包屑「首页」链接使用 `/`，上级链接使用对应列表页（产品 → `/products`，资讯 → `/news`）
- [ ] 3.5 详情页标题与描述随条目变化，返回列表后恢复列表页标题（与 `router.afterEach` 的默认标题不打架）
- [ ] 3.6 条目不存在或已下线时渲染品牌化 404，不显示空壳
- [ ] 3.7 新旧地址并行验证一轮（产品与资讯各取 3 条比对字段与交互；依赖 `product-content-flow`、`article-content-flow` 各自迁移种入的数据，现网两表均为 0 行无法验证）
- [ ] 3.8 与两条内容链划清交界：详情组件的字段渲染、占位图移除、三态分离归各自 change（产品 → `product-content-flow`，资讯 → `article-content-flow`），本组只动地址与路由记录

## 4. 旧详情引用改写

- [ ] 4.1 逐处改写代码内指向详情的前端跳转（当前实测 7 处）：`SecFeatureProducts.vue:33`、`SecLatestNews.vue:40`、`SecProductGrid.vue:82`、`SecNewsFeed.vue:81`、`Search.vue:45` 与 `:48`、以及两个详情组件内部的相关推荐跳转（`ProductDetail.vue:60` / `Article.vue:34`，随目录迁移后位于 `products/detail.vue`、`news/detail.vue`），产品条目改为 `/product/{slug}`、资讯条目改为 `/article/{slug}`
- [ ] 4.2 复核 `src/api/cms.ts` 中 `/products/{id}`、`/articles/{id}` 等后端 REST 路径不被误改（它们不是前端路由）：官网侧 `getProduct`（[cms.ts:80](../../../buinessweb/src/api/cms.ts)）与 `getArticle`（`:83`）走的是 `/public/*/…` 接口路径，管理端 `cmsAdmin` 段从 `:92` 起（`products` 在 `:109`、`articles` 在 `:123`）——本组只改 `router-link` 的 `to` 与装修 props 里的站内地址，这些 REST 路径一字不动
- [ ] 4.3 更新 `src/website/sectionRegistry.ts` 中 `link` 形态字段的默认值与占位提示（`poster-grid` 的 `items[].link`、`hero` 的 `cta*`、`moreLink` 等）
- [ ] 4.4 新增一次性脚本 `backend/scripts/rewrite-detail-links.ts`：读取 `pages.content_json` 与 `draft_json`，把 `^/products/(.+)$` 改写为 `/product/$1`、`^/news/(.+)$` 改写为 `/article/$1`，逐行写回并输出改写清单
- [ ] 4.5 同步 `backend/sql/migrations/002_page_blocks.sql` 等种子中的详情链接示例，保证全新环境初始化即为新地址
- [ ] 4.6 脚本支持 dry-run 输出清单、二次执行不重复改写（幂等）
- [ ] 4.7 复核清单：确认 `pages` 中不再残留旧详情形态链接（一条 SQL 统计残留数应为 0）

## 5. 官网导航与页脚回退

- [ ] 5.1 `WebsiteLayout.vue` 顶栏取消子项下拉渲染分支与 `.nav-sub` / `.nav-item.has-sub` 相关 scoped 样式
- [ ] 5.2 顶栏与移动端菜单按 `menus` 五行 + `ctaMenu` 渲染，`:key` 使用行 id，隐藏项不出现
- [ ] 5.3 页脚恢复为代码固定的两个分组 + 由 `site_settings` 驱动的联系列，移除对 `footerMenus` 的依赖与列数动态 grid 计算
- [ ] 5.4 `stores/site.ts` 与 `types/cms.ts` 删除 `footerMenus` 字段，保留 `ctaMenu` 与 `ensureLoaded(force)`
- [ ] 5.5 站点配置接口失败时的最小兜底导航保留，链接使用白名单内地址（`/`、`/about`、`/products`、`/news`、`/contact`）
- [ ] 5.6 移动端 CTA 与桌面端 CTA 均取 `ctaMenu`，其被隐藏时两处都不渲染

## 6. 严格 404、取数三态与预览门控

- [ ] 6.1 `usePageBlocks(slug)` 增加 `state: 'ok' | 'empty' | 'error'`，不再默认灌入 `defaultBlocks`
- [ ] 6.2 五个装修页组件（或统一入口）在 `state=empty` 时渲染品牌化 404
- [ ] 6.3 `state=error` 时渲染错误态 + 重试按钮，重试重新取数并带加载态
- [ ] 6.4 前台移除对 `pageDefaults.ts` 的 import，文件头注释改为「仅供编辑器默认模板」
- [ ] 6.5 `/public/pages/:slug` 维持 `200 + data:null` 契约，并在函数注释写明三态区分方式
- [ ] 6.6 首页 Banner 覆盖首图逻辑保持仅 `slug=home` 生效，且在 `empty` 分支不参与渲染
- [ ] 6.7 `/preview/:slug` 保持 `meta.requiresAuth`、继续走管理端接口取 `draft_json`，不接进 `usePageBlocks`（否则未发布页无法预览）
- [ ] 6.8 核对公开链路（导航、页脚、区块 props、种子数据）不出现 `/preview/*` 链接；未登录访问 `/preview/about` 跳登录并带回原目标

## 7. 后台：导航菜单页与页面列表

- [ ] 7.1 列表改为六行平铺（无树、无展开箭头），列展示「名称 / 固定链接 / 位置 / 显隐」，链接与位置为只读文本
- [ ] 7.2 移除「新增顶级菜单」「加子项」「删除」按钮与对应逻辑
- [ ] 7.3 编辑弹窗只开放「显示名称」输入与「显示/隐藏」开关，其余字段禁用并给出只读说明
- [ ] 7.4 名称为空或全空格时前端拦截，提交后服务端仍强制校验
- [ ] 7.5 保存成功后调用 `useSiteStore().ensureLoaded(true)`，同浏览器官网顶栏即时更新
- [ ] 7.6 页面顶部提示条说明职责边界：导航项固定，官网地址由代码维护，新增页面需开发参与
- [ ] 7.7 隐藏最后一项顶栏导航时给出后果提示（官网顶栏将为空）
- [ ] 7.8 页面列表（`views/admin/website/pages/index.vue`）的「新建页面」自由填 slug 改为从固定集合中选择尚未存在的页面；五个页面齐备时禁用新建入口并说明「官网页面集合固定，新增需开发参与」
- [ ] 7.9 页面列表与编辑器的跳转仍走 `/admin/pages/editor/:slug`；列表页不再显示「可新建任意页」的暗示文案

## 8. 验证与回滚

- [ ] 8.1 走查 `page-routing` 的 8 项要求 / 25 个场景（含固定白名单、草稿预览登录门控、跨类标识不互相兜底、缺标识落 404、条目下线、旧地址 404、严格 404、错误重试、标题跟随内容）
- [ ] 8.2 走查 `site-navigation` 的 7 项要求 / 18 个场景（含不可增删改链、改名即时生效、隐藏与恢复、无下拉、页脚不受菜单影响、名称纯文本）
- [ ] 8.3 手工验证管理端边界：未登录访问 `/admin/config/menus` 跳登录；官网任何位置不出现管理地址
- [ ] 8.4 backend `npx tsc --noEmit` 与 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过
- [ ] 8.5 执行 007 反向脚本再前向执行一次，确认幂等与恢复正确
- [ ] 8.6 在 `docs/service-design/` 补「官网路由白名单与导航管理边界」一节，收录 design 中的路由统计表与规则口径
- [ ] 8.7 逐条比对 `src/router/index.ts` 与 design 的统计表：开放 10 条 + 登录门控 1 条 + 管理端 16 条，路由表内不存在表外条目
- [ ] 8.8 核对 `page-routing` 的地址集合与 `product-content-flow`、`article-content-flow` 两个 spec 的地址口径一致（`/product/:slug`、`/article/:slug`，无第三条详情地址、无 `/option` 形态残留）；`content-view-structure` 的目录归属与本 change 的路由记录归属不重叠
