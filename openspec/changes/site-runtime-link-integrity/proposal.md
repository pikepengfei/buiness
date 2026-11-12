## Why

> 2026-11-08 / 11-09 修订：需求方确认「按是否装修对页面分类，允许运营在顶部 tab 新增一级页面，固定一级页不可删、新增一级页可删」，并选定 A 方案 `/:slug` 软通配。**本 change 不再禁止新建页面**，原「地址封闭 10 条 / 作废运营自助新建」的口径整体作废。

问题从来不是「运营能建页面」，而是**页面与导航是两套互不联动的数据**：导航菜单可以随意增删行、填任意 url，页面装修可以建任意 slug 的页面却不产生地址，两者都缺格式与保留字校验。结果是一条 `关于品牌 → /option` 的死链让运营以为坏了，而新建的页面发布了却看不见、加了 tab 却装修不了。

本 change 把规则钉死：路由记录形态由代码固定，一级新增页由「页面装修 → 新建页面」创建，后端在同一事务内写入页面记录与顶部 tab 行；固定一级页不可删除，新增一级页可删除并级联清理栏目；产品详情与资讯详情是二级动态页，不进装修体系、链接由代码按标识生成。

## What Changes

- 官网开放路由收敛为**形态固定的 11 条**（详见 `design.md` 路由统计表）：5 个固定一级页 + `/:slug`（一级新增页软通配）+ `/product/:slug` + `/article/:slug` + `/search` + `/login` + 通配 404；另有登录门控的 `/preview/:slug`。**可枚举的是 11 条路由形态，不再是 11 个具体地址**——`/:slug` 下存在哪些地址由 `pages` 表中已发布的一级页决定
- **允许运营新建一级页面（不再禁止新建）**：入口收敛到「页面装修 → 新建页面」，slug 走格式校验 + 保留字校验（含 `option`，防止历史死链复活）；创建时后端事务内联动生成 `pages` 记录与 `menus` header 行（url=`/{slug}`），创建完即可进入编辑器装修、保存草稿、发布
- **一级页面分两类**：`home`/`about`/`products`/`news`/`contact` 五个固定页由代码维护、**不可删除**；运营新建的页面**可以删除**，删除时同事务清理其顶部 tab 行。导航菜单页不再提供顶栏/CTA 的新增与删除入口
- **二级动态页不装修**：`/product/:slug`、`/article/:slug` 取 `products` / `articles` 表，不进 `pages` 表、不出现在装修列表，链接随条目标识由代码生成；`product` / `article` 进保留字
- **BREAKING** 移除 `/products/:slug` 与 `/news/:slug` 两条详情路由，产品详情改挂 `/product/:slug`、资讯详情改挂 `/article/:slug`（列表与详情不再同段嵌套）；实现按功能目录各自落地（分别见 `product-content-flow` 与 `article-content-flow`），站内所有指向旧详情地址的区块 props、种子数据与组件跳转一并改写，不做 301
- **BREAKING** 页脚分组不再由 `menus` 提供，写回代码；迁移把现存 10 条 `location=footer` 行置为隐藏并停止消费（不物理删除，附反向脚本）
- **BREAKING** 取消前台内置内容回落：装修页未发布、`blocks` 为空或 slug 不存在 → 官网渲染品牌化 404；接口异常 → 可重试错误态。`pageDefaults.ts` 降级为编辑器默认模板数据源
- 顶栏子项下拉能力取消：前台不渲染 `children`，后台不提供「加子项」入口（`parent_id` 仅保留历史数据）
- 新增一级页走 `CmsPage.vue` 的严格三态：未发布 / 空区块 / 已删除 → 品牌化 404，接口异常 → 可重试错误态，不显示空白壳或内置兜底
- 两条详情地址对不存在的条目、已下线的条目一律返回品牌化 404，且不泄漏任何占位内容
- 导航改名/隐藏即时生效（`/public/site` 的 `no-cache` + 内容指纹 ETag 已落地，本 change 固化并要求新建/保存后强制刷新站点缓存）

## Capabilities

### New Capabilities

- `page-routing`: 官网路由形态白名单、一级页面分类（固定不可删 / 新增可删）、新建一级页的地址与 tab 生成规则、产品与资讯的两条独立详情地址 `/product/:slug`、`/article/:slug`、未发布与异常时的前台表现
- `site-navigation`: 固定六行与新增页 tab 行两类导航项的管理边界（改名、显隐、不可改链、不可加子项）

### Modified Capabilities

（无——`page-routing` / `site-navigation` 由本 change 首次建立；此前按「地址封闭集合 + 禁止新建页面」提交的版本已被本次提案取代）

## Impact

- 前端路由：`buinessweb/src/router/index.ts`（删 `/products/:slug`、`/news/:slug` 两条，加 `/product/:slug`、`/article/:slug` 两条，兜底前加 `/:slug` → `CmsPage.vue`）
- 前端页面：新增 `views/website/CmsPage.vue`（一级新增页渲染 + 四态）与 `src/website/pageRoutes.ts`（固定集合、保留字、`pagePath` / `isFixedPage` / `validatePageSlug`）；两条详情路由指向各自功能目录的详情组件（`views/website/products/detail.vue`、`views/website/news/detail.vue`）
- 导航：`buinessweb/src/layout/WebsiteLayout.vue`（取消下拉与页脚菜单消费，页脚写回代码）、`stores/site.ts`、`types/cms.ts`、`views/admin/website/menus.vue`（顶栏/CTA 只留改名与显隐，移除新增/删除/加子项入口）、`views/admin/website/pages/index.vue`（**新建页面即为新增顶部栏目**，带格式与保留字校验、固定/新增标签、固定页禁删）
- 后端：`backend/src/routes/public.ts`（`/public/site` 只回 header 与 cta）、`backend/src/routes/content.ts`（`POST /pages` 格式 + 保留字校验并在事务内联动建 `menus` header 行；`DELETE /pages/:id` 拦截固定页并级联清理 tab 行；`/menus` 固定行禁删禁改链）
- 数据：执行 `007_fixed_nav_rows.sql`（预置并锁定 6 条固定行、隐藏 footer 行、停用白名单外的 `关于品牌 → /option` 行），附反向脚本。**本次不为 `pages` 新增列或迁移**——固定身份由 `FIXED_PAGE_SLUGS` 派生判定
- 不改动：装修区块模型、发布流程（`page-publication-approval`）、素材库、后台侧栏菜单（其数据源是 `adminMenu.ts`，与 `menus` 表无关）、草稿预览页 `views/website/Preview.vue` 及其取数方式
