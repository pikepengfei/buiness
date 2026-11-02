# site-runtime-link-integrity

官网地址封闭化：路由由代码固定、导航菜单只管「改名 + 显隐」、产品与资讯详情各用一条独立地址、未发布即 404。

## 在全链路中的位置

装修线的三个 change 落地顺序（后两个依赖本 change 的地基）：

1. **本 change** — 钉死「哪些地址存在、谁能在官网看到」：地址封闭集合、所见即所发布、导航行不可配置成死链
2. `page-publication-approval` — 在「未发布即不可见」成立之后，才有意义地加审批闸门与回滚
3. `decoration-editor-toolkit` — 装修效率增强，改动集中在编辑器左栏与新面板，排在审批流之后以免 `editor.vue` 冲突

另两条内容链（`product-content-flow`、`article-content-flow`）同样以本 change 的地基为前提：它们各自把 `/product/:slug`、`/article/:slug` 挂到自己目录的详情组件上，互不依赖，可并行或分批发版。

## 规则口径（已与需求方逐条确认）

- 开放路由是封闭集合，共 **10 条**：`/`、`/about`、`/products`、`/news`、`/contact`（5 个装修页）+ `/product/:slug`（产品详情）+ `/article/:slug`（资讯详情）+ `/search` + `/login` + 通配 404
- 开放集合之外只有 `/preview/:slug`（装修编辑器的草稿预览，要求登录，不属开放路由）与管理端 `/admin` 下 16 条；路由表内不得有表外条目
- 装修页的 slug 也固定为 `home`/`about`/`products`/`news`/`contact` 五个：前端路由表与后端 `POST /pages` 双向校验，后台「新建页面」入口改为从固定集合中选择尚未存在的那几个
- 管理端路由一律要求登录，官网任何位置不出现管理地址
- 导航菜单只管顶栏 **5 行 + CTA 1 行**：行身份是 url，运营只能改显示名称、切换显示/隐藏；不可新增、删除、改链接、改位置、改打开方式、加子项
- 页脚不再由 `menus` 提供，写回代码
- 产品详情用 `/product/:slug`、资讯详情用 `/article/:slug`，两条地址互不回退；旧的 `/products/:slug`、`/news/:slug` 直接移除，不做自动跳转。详情实现分处两个功能目录（`views/website/products/detail.vue`、`views/website/news/detail.vue`），目录本身的落地分别由 `product-content-flow`、`article-content-flow` 交付，本 change 只把地址接到实现上

## 关键交付物

- `proposal.md` — 为什么做、改什么、4 处 **BREAKING** 与影响面
- `specs/page-routing/spec.md` — 固定白名单、草稿预览的登录门控、装修页与地址一一对应、两条独立详情地址与跨类不兜底、严格 404 与错误态（8 项要求 / 25 个场景）
- `specs/site-navigation/spec.md` — 顶栏六行的不可变性、改名与显隐、名称纯文本、页脚不由菜单配置、变更即时生效（7 项要求 / 18 个场景）
- `design.md` — 三类地址的路由统计表（开放 10 + 门控 1 + 管理端 16）、D1–D7 技术决策（含被否决的 `/p/:slug` 通配与 `/option/:type/:slug` 统一形态）、风险、迁移计划与回滚、3 个 Open Question
- `tasks.md` — 64 项可勾选任务，分 8 组（后端接口收窄 → 迁移 007 → 两条独立详情路由 → 旧链接改写 → 导航与页脚回退 → 严格 404 与预览门控 → 后台菜单页与页面列表 → 验证回滚）

## 已先行落地与需要回退的部分

已落地并保留：`menus.location` 迁移（`backend/sql/migrations/004_menu_locations.sql`）、`/public/site` 的 `no-cache` + 内容指纹 ETag 与 `304` 短路、顶栏与 CTA 由菜单数据驱动、`stores/site.ts` 的 `ensureLoaded(force)`。

按新规则需要回退：`WebsiteLayout.vue` 的页脚数据驱动与顶栏子项下拉、`/public/site` 的 `footerMenus` 字段（见 `tasks.md` 第 1 与第 5 组）。

## 待确认

`/product`、`/article` 缺标识时是否友好跳转到各自列表页、`/search` 是否留在开放白名单、详情页 SEO（本 change 明确不做）——见 `design.md` 的 Open Questions。
