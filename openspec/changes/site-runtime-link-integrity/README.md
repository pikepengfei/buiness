# site-runtime-link-integrity

官网地址形态封闭化：路由记录由代码固定，**允许运营新建一级页面**（不再禁止新建）；新建时后端联动生成顶部 tab，固定一级页不可删、新增一级页可删；产品与资讯详情是二级动态页、不参与装修；未发布即 404。

> 2026-11-08 / 11-09 修订：需求方确认页面分类模型并选定 A 方案 `/:slug` 软通配，原「地址封闭 10 条、不开放新建页面」口径作废。本目录 5 份文档已按新口径同步。

## 在全链路中的位置

装修线的 change 落地顺序（后一个依赖本 change 的地基）：

1. **本 change** — 钉死「地址的形态、页面分类、谁能在官网看到内容」：一级新增页与顶部 tab 同生共死、所见即所发布、导航行不可配置成死链
2. `decoration-editor-toolkit` — 装修效率增强，改动集中在编辑器左栏与新面板

> 原排位第 2 的 `page-publication-approval`（审批闸门与版本回滚）已于 2026-11-10 经需求方决定弃做并归档（`archive/2026-11-10-page-publication-approval`），发布仍保持单人一步动作。

另两条内容链（`product-content-flow`、`article-content-flow`）同样以本 change 的地基为前提：它们各自把 `/product/:slug`、`/article/:slug` 挂到自己目录的详情组件上，互不依赖，可并行或分批发版。

## 规则口径（已与需求方逐条确认）

- **不再禁止新建页面**：运营在「页面装修 → 新建页面」创建一级页，slug 走格式校验（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）与保留字校验；保留字含固定 slug、`product`/`article`、`search`/`login`/`preview`/`admin`、`option` 等
- 创建时后端在**同一事务**里写 `pages` 记录 + `menus` header 行（url=`/{slug}`），创建完即可装修、保存草稿、发布，顶栏随即出现栏目
- 一级页面分两类：固定五个（`home`/`about`/`products`/`news`/`contact`）由代码维护、**不可删除**；新增一级页**可删除**，删除时级联清理其 tab 行。固定身份由 `FIXED_PAGE_SLUGS` 派生，不加数据库标记列
- 官网开放路由**形态 11 条**：`/`、`/about`、`/products`、`/news`、`/contact` + `/:slug`（新增一级页软通配）+ `/product/:slug` + `/article/:slug` + `/search` + `/login` + 通配 404；另有登录门控 `/preview/:slug` 与管理端 `/admin` 下 16 条
- 二级动态页（产品/资讯详情）**不装修**：不进 `pages` 表、不出现在装修列表，链接随条目标识由代码生成；条目下线即 404
- 管理端路由一律要求登录，官网任何位置不出现管理地址
- 导航菜单分两类：固定六行（顶栏 5 + CTA 1）只可改名与显隐，不可增删、改链接、改位置、改打开方式、加子项；新增页 tab 行由页面流程内部产生与清理，导航菜单页**不提供**顶栏/CTA 的新增与删除入口
- 页脚不再由 `menus` 提供，写回代码
- 旧详情地址 `/products/:slug`、`/news/:slug` 直接移除，不做自动跳转；详情实现分处两个功能目录，本 change 只把地址接到实现上
- 新增一级页走 `CmsPage.vue` 严格三态：未发布 / 空区块 / 已删除 → 品牌化 404，接口异常 → 可重试错误态

## 关键交付物

- `proposal.md` — 为什么做、改什么、3 处 **BREAKING** 与影响面（含「允许新建一级页」的新增能力）
- `specs/page-routing/spec.md` — 路由形态白名单、一级页新建与删除规则、草稿预览登录门控、两条独立详情地址与跨类不兜底、严格 404 与错误态（8 项要求 / 29 个场景）
- `specs/site-navigation/spec.md` — 固定六行与新增 tab 行的管理边界、改名与显隐、名称纯文本、页脚不由菜单配置、变更即时生效（7 项要求 / 19 个场景）
- `design.md` — 页面分类表与路由统计表（开放 11 + 门控 1 + 管理端 16）、D1–D9 技术决策（含 A/B/C 三种地址形态的取舍）、风险、迁移计划与回滚、Open Questions
- `tasks.md` — 9 组可勾选任务（后端收窄 → 迁移 007 → 独立详情路由 → 旧链接改写 → 导航与页脚回退 → 严格 404 与预览门控 → 后台菜单页与页面列表 → 验证回滚 → **A 方案一级新增页（已落地）**）

## 落地状态（2026-11-09）

**已实现并验证**：

- `POST /pages` 格式 + 保留字 + header url 冲突校验，事务内联动建 `pages` 记录与顶部 tab 行；`DELETE /pages/:id` 拦截固定页并级联清理 tab 行
- `src/website/pageRoutes.ts` 共享口径常量、`views/website/CmsPage.vue` 四态渲染、`router/index.ts` 的 `/:slug` 软通配记录（兜底之前）
- 页面列表新建表单校验 / 类型标签 / 固定页禁删 / 成功提示 / 刷新站点缓存；导航菜单页移除顶栏/CTA 新增删除入口、编辑只提交名称与显隐
- `backend tsc --noEmit`、`buinessweb vue-tsc --noEmit` 均通过；vue-router v5 实测静态优先级：`/about → about`、`/cases → dynamic-page`、`/product/p1 → product-detail`、`/product → dynamic-page`（查无页面落 404）
- **本次零 schema 变更、零新迁移**

**仍待完成**：

- 迁移 `007_fixed_nav_rows.sql` 未创建/执行（`id=6 /option` 死链行与页脚 10 行可能仍 `status=1`）
- 旧详情路由 `/products/:slug`、`/news/:slug` 仍并存；站内旧链接改写脚本 `rewrite-detail-links.ts` 未做
- D6 全局三态未做：固定五个装修页仍由 `usePageBlocks` 灌 `defaultBlocks`，下线后照常显示兜底（新增一级页已走 `CmsPage.vue` 严格三态，不受影响）
- `/public/site` 的 `footerMenus`、`WebsiteLayout.vue` 页脚与顶栏下拉尚未回退
- 端到端「新建 → 装修 → 发布 → 官网显示」需起服务连数据库手工走查

## 待确认

保留字表当前前后端各一份常量（靠注释同步）是否改为后端单点下发；新增一级页是否允许创建后隐藏 / 不进导航；新增页 slug 创建后是否允许修改（建议禁止）；`/search` 是否保留；详情页 SEO（本 change 明确不做）——详见 `design.md` 的 Open Questions。
