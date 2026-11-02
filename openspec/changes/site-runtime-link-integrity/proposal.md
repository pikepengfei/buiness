## Why

官网地址必须是**封闭集合**：路由表固定、导航菜单只是这几条固定地址的「显示名称与显隐开关」。当前设计把两件事混在一起——菜单可以随意增删行、填任意 url，装修可以建任意 slug 的页面，结果是一条 `关于品牌 → /option` 的死链让运营以为坏了，而后台改导航还常常被缓存吃掉。

本 change 把规则钉死：路由由代码固定，导航行不可增删不可改地址、只能改名与隐藏，产品详情与资讯详情各用一条独立地址。

## What Changes

- 官网开放路由收敛为**固定白名单 10 条**（详见 `design.md` 的路由统计表）：5 个装修页 + `/product/:slug` + `/article/:slug` + `/search` + `/login` + 通配 404；此外只有装修编辑器的草稿预览地址 `/preview/:slug` 留在官网布局内，且要求登录，不属于开放路由
- **BREAKING** 移除 `/products/:slug` 与 `/news/:slug` 两条详情路由，产品详情改挂 `/product/:slug`、资讯详情改挂 `/article/:slug`（列表与详情不再同段嵌套）；实现按功能目录各自落地（分别见 `product-content-flow` 与 `article-content-flow`），站内所有指向旧详情地址的区块 props、种子数据与组件跳转一并改写
- **BREAKING** 导航菜单退化为「固定项管理」：顶栏 5 行 + CTA 1 行，行身份由 url 决定且由迁移脚本预置；运营**只能**修改名称与显示/隐藏，**不能**新增、删除、改链接、改位置、改打开方式、加子项
- **BREAKING** 页脚分组不再由 `menus` 提供，写回代码；迁移把现存 10 条 `location=footer` 行置为隐藏并停止消费（不物理删除，附反向脚本）
- 顶栏子项下拉能力取消：前台不渲染 `children`，后台不提供「加子项」入口（`parent_id` 仅保留历史数据）
- **BREAKING** 取消前台内置内容回落：装修页未发布、`blocks` 为空或 slug 不存在 → 官网渲染品牌化 404；接口异常 → 可重试错误态。`pageDefaults.ts` 降级为编辑器默认模板数据源
- 两条详情地址对不存在的条目、已下线的条目一律返回品牌化 404，且不泄漏任何占位内容
- 导航改名/隐藏即时生效（`/public/site` 的 `no-cache` + 内容指纹 ETag 已落地，本 change 固化并要求后台保存后强制刷新站点缓存）

## Capabilities

### New Capabilities

- `page-routing`: 官网固定路由白名单、装修页与地址的一一对应、产品与资讯的两条独立详情地址 `/product/:slug`、`/article/:slug`、未发布与异常时的前台表现
- `site-navigation`: 顶栏固定导航项与 CTA 的管理规则（改名、显隐、顺序）与不可变性要求

### Modified Capabilities

（无——`page-routing` / `site-navigation` 由本 change 首次建立；此前按「任意新建页面 + `/p/:slug` 通配」提交的版本已被本提案取代，尚未进入实现）

## Impact

- 前端路由：`buinessweb/src/router/index.ts`（删 `/products/:slug`、`/news/:slug` 两条，加 `/product/:slug`、`/article/:slug` 两条）
- 前端页面：两条新详情路由的记录分别指向产品与资讯各自的详情实现（`views/website/products/detail.vue`、`views/website/news/detail.vue`；这两个功能目录的落地分别由 `product-content-flow`、`article-content-flow` 交付，本 change 只负责把地址接到实现上），旧的两条详情地址随路由移除而不再被访问；`views/admin/content/{product,article}-edit.vue` 的预览跳转、`src/website/sections/*` 中生成详情链接的全部位置改写
- 导航：`buinessweb/src/layout/WebsiteLayout.vue`（取消下拉与页脚菜单消费，页脚写回代码）、`stores/site.ts`、`types/cms.ts`、`views/admin/website/menus.vue`（只读字段置灰、移除新增/删除/加子项/位置/链接/打开方式）、`views/admin/website/pages/index.vue`（新建入口收敛为「从固定集合中选择尚未存在的页面」）
- 后端：`backend/src/routes/public.ts`（`/public/site` 只回 header 与 cta）、`backend/src/routes/content.ts`（`/menus` 禁止增删与改 url/location/顺序，`PATCH` 仅 `title`/`status` 生效；`POST /pages` 的 slug 收敛为五个白名单值）
- 数据：新增迁移 `backend/sql/migrations/007_fixed_nav_rows.sql`（预置并锁定 6 条固定行、隐藏 footer 行、停用白名单外的 `关于品牌 → /option` 行），附反向脚本
- 不改动：装修区块模型、发布流程（`page-publication-approval`）、素材库、后台侧栏菜单（其数据源是 `adminMenu.ts`，与 `menus` 表无关）、草稿预览页 `views/website/Preview.vue` 及其取数方式
