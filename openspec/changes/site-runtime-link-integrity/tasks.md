> 2026-11-09 进度说明：需求方确认**允许运营新建一级页面（不再禁止新建）**并选定 A 方案 `/:slug` 软通配。下方各组已按新口径修正；已落地的实现集中登记在**第 9 组**（全部勾选），其余组保持未完成状态但不再包含「禁止新建 / 固定集合选择 / 开放 10 条」等旧表述。

## 1. 后端：站点配置、菜单与页面创建接口收窄

- [ ] 1.1 `/public/site` 响应改为 `{ settings, menus(header 固定六行 + 新增栏目行), ctaMenu }`，删除 `footerMenus` 字段与其树构建分支
- [ ] 1.2 `/public/site` 菜单查询限定 `location IN ('header','cta') AND status=1`，且只取顶级行（`parent_id IS NULL`）
- [ ] 1.3 保留 `no-cache` + 内容指纹 ETag 与 `304` 短路（已实现），补一条注释说明导航要求即时生效
- [ ] 1.4 `GET /menus`（管理端）只返回固定六行与新增页 tab 行的单层列表，不再构树、不再返回页脚行
- [ ] 1.5 `PATCH /menus/:id` 仅接受 `title` 与 `status`；出现 `url`/`location`/`target`/`parentId`/`sort` 且与库中值不同 → 400 且不改数据
- [ ] 1.6 `title` 必填校验（trim 后非空、长度上限），`status` 仅接受 0/1
- [ ] 1.7 移除 `POST /menus`、固定行 `DELETE /menus/:id`、`/menus/reorder` 的路由注册（连同 `MENU_LOCATIONS` 相关的子项继承与级联逻辑）；页脚行的维护入口在第 5 组回退后一并移除
- [ ] 1.8 补写导航项改名/显隐的 `audit_logs`（action `menu.update`）
- [ ] 1.9 `POST /pages` 增加 slug 格式校验、保留字校验与 header url 冲突校验，并在事务内联动创建 `pages` 记录与 `menus` header 行；`DELETE /pages/:id` 拦截固定页并级联清理 tab 行（**实现已落地，见 9.1 / 9.2**；本项留作服务端回归走查）
- [ ] 1.10 backend `npx tsc --noEmit` 通过（**已验证，见 9.8**）

## 2. 数据迁移 007

- [ ] 2.1 新增 `backend/sql/migrations/007_fixed_nav_rows.sql`：确认/补建 header 五行（url `/`、`/about`、`/products`、`/news`、`/contact`，`sort` 1..5）与 cta 一行（url `/contact`），全部幂等 `WHERE NOT EXISTS`
- [ ] 2.2 迁移内**不改任何 `title`**，并在文件注释写明「名称由运营维护，迁移不覆盖」
- [ ] 2.3 白名单外的顶栏行（现状为 id=6 `关于品牌 → /option`）置 `status=0`，注释说明 `/option` 是历史死链、已进保留字表，不占导航位
- [ ] 2.4 页脚 10 行（两分组 + 8 子项）置 `status=0`，数据保留不删
- [ ] 2.5 附反向脚本：恢复上述行的 `status`、删除本次补入的行；注释标明执行顺序
- [ ] 2.6 同步 `backend/sql/schema.sql`：种子只保留固定六行 + 页脚与子项不再播种，并在 004 相关注释处标注「007 起 footer 不再被消费」
- [ ] 2.7 在本地库执行迁移后，用查询核对结果（固定六行 `status=1`，页脚与 `/option` 行 `status=0`）
- [ ] 2.8 错别字数据订正（2026-10-29 经需求方同意破例，是 D7「不改 title」的唯一例外）：`UPDATE menus SET title='新闻资讯' WHERE url='/news' AND title='新闻咨询'`；同时订正 `pages` 中 `slug='news'` 的 `title` 与 `content_json`/`draft_json` 里三处「新闻咨询」文案。反向脚本把这两处改回原值

> 本 change **不为 `pages` 新增任何列或迁移**：固定页身份由 `FIXED_PAGE_SLUGS` 派生判定（design D9），无需 `is_fixed` 列。

## 3. 两条独立详情路由 `/product/:slug`、`/article/:slug`

- [ ] 3.1 路由表已有 `/product/:slug`（name `product-detail`）与 `/article/:slug`（name `article-detail`）；**仍需移除** `/products/:slug` 与 `/news/:slug` 两条并存记录，不配任何自动跳转
- [ ] 3.2 两条记录各自指向所在功能目录的详情组件（已指向 `views/website/products/detail.vue`、`views/website/news/detail.vue`）
- [ ] 3.3 两条地址互不回退：各按自己的内容集合取数，用另一类标识访问即品牌化 404；`/product`、`/article` 缺标识由 `/:slug` 接住并因查无页面落 404（已由 `CmsPage.vue` 保证）
- [ ] 3.4 面包屑「首页」链接使用 `/`，上级链接使用对应列表页（产品 → `/products`，资讯 → `/news`）
- [ ] 3.5 详情页标题与描述随条目变化，返回列表后恢复列表页标题（与 `router.afterEach` 的默认标题不打架）
- [ ] 3.6 条目不存在或已下线时渲染品牌化 404，不显示空壳
- [ ] 3.7 新旧地址并行验证一轮（产品与资讯各取 3 条比对字段与交互）
- [ ] 3.8 与两条内容链划清交界：详情组件的字段渲染、占位图移除、三态分离归各自 change，本组只动地址与路由记录

## 4. 旧详情引用改写

- [ ] 4.1 逐处改写代码内指向详情的前端跳转（当前实测 7 处：`SecFeatureProducts.vue`、`SecLatestNews.vue`、`SecProductGrid.vue`、`SecNewsFeed.vue`、`Search.vue` 两处、两个详情组件内部推荐跳转），产品改 `/product/{slug}`、资讯改 `/article/{slug}`（**代码侧已改，见 9.9**；本项留作回归核对）
- [ ] 4.2 复核 `src/api/cms.ts` 中 `/products/{id}`、`/articles/{id}` 等后端 REST 路径不被误改（它们不是前端路由）
- [ ] 4.3 更新 `src/website/sectionRegistry.ts` 中 `link` 形态字段的默认值与占位提示（代码侧已无旧详情形态）
- [ ] 4.4 新增一次性脚本 `backend/scripts/rewrite-detail-links.ts`：读取 `pages.content_json` 与 `draft_json`，把 `^/products/(.+)$` 改写为 `/product/$1`、`^/news/(.+)$` 改写为 `/article/$1`，逐行写回并输出改写清单
- [ ] 4.5 同步 `backend/sql/migrations/002_page_blocks.sql` 等种子中的详情链接示例
- [ ] 4.6 脚本支持 dry-run 输出清单、二次执行不重复改写（幂等）
- [ ] 4.7 复核清单：确认 `pages` 中不再残留旧详情形态链接（一条 SQL 统计残留数应为 0）

## 5. 官网导航与页脚回退

- [ ] 5.1 `WebsiteLayout.vue` 顶栏取消子项下拉渲染分支与 `.nav-sub` / `.nav-item.has-sub` 相关 scoped 样式
- [ ] 5.2 顶栏与移动端菜单按 `menus`（固定六行 + 新增栏目行）+ `ctaMenu` 渲染，`:key` 使用行 id，隐藏项不出现
- [ ] 5.3 页脚恢复为代码固定的两个分组 + 由 `site_settings` 驱动的联系列，移除对 `footerMenus` 的依赖与列数动态 grid 计算（当前 `footerCols = []` 为临时中间态，不是最终形态）
- [ ] 5.4 `stores/site.ts` 与 `types/cms.ts` 删除 `footerMenus` 字段，保留 `ctaMenu` 与 `ensureLoaded(force)`
- [ ] 5.5 站点配置接口失败时的最小兜底导航保留，链接使用固定地址（`/`、`/about`、`/products`、`/news`、`/contact`）
- [ ] 5.6 移动端 CTA 与桌面端 CTA 均取 `ctaMenu`，其被隐藏时两处都不渲染

## 6. 严格 404、取数三态与预览门控

- [ ] 6.1 `usePageBlocks(slug)` 增加 `state: 'ok' | 'empty' | 'error'`，不再默认灌入 `defaultBlocks`（**一级新增页已由 `CmsPage.vue` 独立实现四态，见 9.5；本项针对固定五个装修页仍待做**）
- [ ] 6.2 五个固定装修页组件在 `state=empty` 时渲染品牌化 404
- [ ] 6.3 `state=error` 时渲染错误态 + 重试按钮，重试重新取数并带加载态
- [ ] 6.4 前台移除对 `pageDefaults.ts` 的 import，文件头注释改为「仅供编辑器默认模板」
- [ ] 6.5 `/public/pages/:slug` 维持 `200 + data:null` 契约，并在函数注释写明三态区分方式
- [ ] 6.6 首页 Banner 覆盖首图逻辑保持仅 `slug=home` 生效，且在 `empty` 分支不参与渲染
- [ ] 6.7 `/preview/:slug` 保持 `meta.requiresAuth`、继续走管理端接口取 `draft_json`，不接进 `usePageBlocks`
- [ ] 6.8 核对公开链路（导航、页脚、区块 props、种子数据）不出现 `/preview/*` 链接；未登录访问 `/preview/about` 跳登录并带回原目标

## 7. 后台：导航菜单页与页面列表

- [ ] 7.1 顶栏/CTA 列表展示固定六行 + 新增栏目行（单层、无树、无展开箭头），列展示「名称 / 固定链接 / 位置 / 显隐」，链接与位置为只读文本
- [ ] 7.2 移除顶栏/CTA 的「新增顶级菜单」「新增按钮」「加子项」「删除」按钮与对应逻辑（**已落地，见 9.7**）
- [ ] 7.3 编辑弹窗只开放「显示名称」输入与「显示/隐藏」开关，其余字段禁用并给出只读说明（**已落地，见 9.7**）
- [ ] 7.4 名称为空或全空格时前端拦截，提交后服务端仍强制校验（前端已落地，服务端对应 1.6）
- [ ] 7.5 保存成功后调用 `useSiteStore().ensureLoaded(true)`，同浏览器官网顶栏即时更新；新建页面成功后同样刷新（**已落地，见 9.6**）
- [ ] 7.6 页面顶部提示条说明职责边界：固定导航项只管改名与显隐，**新增栏目请到「页面装修 → 新建页面」**；不再出现「新增页面需开发参与」的旧文案
- [ ] 7.7 隐藏最后一项顶栏导航时给出后果提示（官网顶栏将为空）
- [ ] 7.8 页面列表「新建页面」**开放自由填 slug（带格式与保留字预校验）**，创建时后端联动生成顶部 tab 行；列表区分「固定 / 新增」标签，固定页删除按钮禁用；**不再收敛为「从固定集合中选择」**（**已落地，见 9.3 / 9.6**）
- [ ] 7.9 页面列表与编辑器的跳转仍走 `/admin/pages/editor/:slug`；列表页不再显示「官网页面集合固定」的暗示文案

## 8. 验证与回滚

- [ ] 8.1 走查 `page-routing` 的 8 项要求 / 29 个场景（含**允许新建一级页**、保留字与格式拦截、固定页不可删、新增页可删并清理 tab、草稿预览门控、跨类标识不兜底、旧地址 404、严格 404、错误重试、标题跟随内容）
- [ ] 8.2 走查 `site-navigation` 的 7 项要求 / 19 个场景（含导航菜单页无新增入口、新增栏目由页面流程产生、固定行不可删改链、改名即时生效、无下拉、页脚不受菜单影响、名称纯文本）
- [ ] 8.3 手工验证管理端边界：未登录访问 `/admin/config/menus` 跳登录；官网任何位置不出现管理地址
- [ ] 8.4 backend `npx tsc --noEmit` 与 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过（**已验证，见 9.8**）
- [ ] 8.5 执行 007 反向脚本再前向执行一次，确认幂等与恢复正确
- [ ] 8.6 在 `docs/service-design/` 补「官网路由形态与导航管理边界」一节，收录 design 中的页面分类表、路由统计表与规则口径
- [ ] 8.7 逐条比对 `src/router/index.ts` 与 design 的统计表：开放 **11 条** + 登录门控 1 条 + 管理端 16 条，并实测静态优先级（`/about → about`、`/cases → dynamic-page`、`/product/p1 → product-detail`、`/product → dynamic-page`、`/foo/bar → notFound`）
- [ ] 8.8 核对 `page-routing` 的地址集合与 `product-content-flow`、`article-content-flow` 两个 spec 的地址口径一致（`/product/:slug`、`/article/:slug`，无第三条详情地址、无 `/option` 形态残留）
- [ ] 8.9 端到端走查「新建页面 → 装修（组件库插入模块）→ 保存草稿 → 发布 → 顶栏出现 → 官网 `/{slug}` 显示 → 删除 → 404」，需起服务连数据库

## 9. A 方案：一级新增页（2026-11-09 已落地）

- [x] 9.1 `backend/src/routes/content.ts` 新增 `FIXED_PAGE_SLUGS` / `RESERVED_PAGE_SLUGS` / `PAGE_SLUG_RE` 常量；`POST /pages` 加格式、保留字与 header url 冲突校验，返回 `{ id, slug, tabUrl }`
- [x] 9.2 `POST /pages` 在同一事务内写 `pages` 记录与 `menus` header 行（url `/{slug}`、sort 追加末尾、title 截 50 字符）；`DELETE /pages/:id` 拦截固定 slug（400）并级联清理 tab 行
- [x] 9.3 新建 `buinessweb/src/website/pageRoutes.ts`：固定集合、保留字、`pagePath` / `isFixedPage` / `validatePageSlug`，与后端常量注释要求同步
- [x] 9.4 `router/index.ts` 在兜底 404 之前加 `:slug → dynamic-page`（不设 `meta.title` 避免标题闪烁）
- [x] 9.5 新建 `views/website/CmsPage.vue`：四态 `loading/ok/empty/error`，空内容/已删除 → `NotFound`，接口异常 → 重试；**不改动固定五页的 `usePageBlocks`**
- [x] 9.6 `pages/index.vue` 新建表单预校验、自动生成栏目提示、成功后 `ensureLoaded(true)`、类型标签、固定页删除按钮禁用与函数内二次拦截；`api/cms.ts` 返回类型对齐
- [x] 9.7 `menus.vue` 移除顶栏/CTA 的新增与删除入口、提示引导到页面装修；编辑弹窗只提交 `title` + `status`，链接/打开方式/排序置只读
- [x] 9.8 两端类型检查通过；vue-router v5 实测路由匹配优先级符合预期
- [x] 9.9 组件内旧详情跳转已统一改为 `/product/{slug}`、`/article/{slug}`；`cms.ts` 的后端 REST 路径未误改
- [x] 9.10 `design.md` D1 / D4 / D7 / D8 / D9、迁移计划与回滚同步到实际实现口径（**不加 `is_fixed` 列，固定身份由 slug 集合派生**）
- [x] 9.11 `proposal.md`、`README.md`、两份 spec、`tasks.md` 同步到「允许新建一级页面」口径（2026-11-09）
