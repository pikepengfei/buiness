## Why

资讯是官网第二条业务内容链，它的问题和产品链不同类：不是字段没录对，而是**撰稿过程本身不安全、且「保存」与「生效」没有分轴**。

- **正文要手写 HTML。** 编辑页的正文是源码文本域，`article-edit.vue` 顶部注释自陈「正文用 HTML 源码编辑……（不引入富文本依赖）」（[article-edit.vue:5](../../../buinessweb/src/views/admin/content/article-edit.vue)、[:163](../../../buinessweb/src/views/admin/content/article-edit.vue)），运营要手敲标签，官网的门面靠手写标签撑着。
- **改一句就上线一句。** `articles` 只有一份 `body`，`PATCH /articles/:id` 直接覆盖（[content.ts:266](../../../backend/src/routes/content.ts)）——改一篇已发布资讯改到一半，官网立刻显示半成品。更糟的是这份「唯一内容」还同时承担着草稿职责：新建时它必须能被空正文占位，于是「线上内容」和「未发布内容」被压在同一列里，谁也保护不了谁。
- **清洗白名单决定了富文本的能力边界，但界面与它对不上。** `sanitize-html` 全剥 `style`、`class` 只在 `img` 上保留（[lib.ts:54-63](../../../backend/src/lib.ts)）——任何提供对齐/字号/颜色/表格的编辑器都会出现「编辑器里好看、存进去打回原形」。
- **详情里的分类和标签从来没人下发（本轮新查出的断链）。** `/public/articles/:slug` 是裸 `SELECT *`（[public.ts:124](../../../backend/src/routes/public.ts)），只有 `category_id`；相关资讯子查询只取 `id,slug,title,cover_image`（[public.ts:128](../../../backend/src/routes/public.ts)），连 `tags` 都没有。而前端读的是 `article.category`（[Article.vue:73-79](../../../buinessweb/src/views/website/Article.vue)）与推荐卡片的 `r.category` / `r.tags`（[:108](../../../buinessweb/src/views/website/Article.vue)）→ 详情元信息错位、每张推荐卡片都显示写死的 `'NEWS'`。列表接口反倒 join 了分类名（[public.ts:116](../../../backend/src/routes/public.ts)），`/public/search` 的资讯分支同样没 join（[public.ts:172](../../../backend/src/routes/public.ts)）——写死兜底实测 5 处：详情 2 处、首页两个资讯区块（[SecLatestNews.vue:41](../../../buinessweb/src/views/website/sections/SecLatestNews.vue)、[SecNewsFeed.vue:115](../../../buinessweb/src/views/website/sections/SecNewsFeed.vue)）、搜索结果 1 处（[Search.vue:115](../../../buinessweb/src/views/website/Search.vue)），所以只修详情接口不足以让写死文案消失。
- **发布即时生效被响应缓存吞掉。** `/public/*` 统一带 `max-age`（默认 60 秒），只有站点配置与装修页显式豁免；spec 写的是「即时生效，不依赖缓存过期」，断言在窗口内时快时慢。
- **浏览量在 GET 里自增。** [public.ts:126](../../../backend/src/routes/public.ts) 在只读接口里写库，同一缓存副本被多人命中时计数丢失、刷新即虚增；且改成显式上报后，官网没有任何展示面，「计数生效」只能查库验收。
- **为修计数而新增的明细表，本身会成为第四个断点。** `DELETE /articles/:id`（[content.ts:289](../../../backend/src/routes/content.ts)）是无外键的裸删除：若浏览去重明细表只写 `article_id` 而不定级联语义，删掉的资讯会在明细里留下一批指向不存在 id 的行并继续被写入；只加外键不加 `CASCADE` 又反过来让「删除一篇被人看过的资讯」直接报 500。同一条规则也必须给「线上行 ↔ 未发布行」之间的引用定下来（2026-10-30 修订后该引用列已被撤除，级联语义落在浏览明细一条上，见 D10/D14）。
- **状态与文案不对称。** 编辑页把状态 2 叫「已下架」而列表与后端叫「已下线」；`PATCH` 的字段映射不含 `slug`（[content.ts:262](../../../backend/src/routes/content.ts)），标识改了静默无效；删资讯分类是裸 `DELETE` + `ON DELETE SET NULL`，已发布内容的归属被静默清空。
- **创建路径可以绕过正文下限。** `POST /articles` 允许 `status=1` 且 `body` 可选（[content.ts:243](../../../backend/src/routes/content.ts)、[:250](../../../backend/src/routes/content.ts)），新建即发布可以把空正文直接推上线。
- **谁改的没人知道。** `articles` 只有 `created_by`（创建人），修改时间会随任何写入刷新却不记是谁；`audit_logs` 虽有操作人与 IP，但 `entity_id` 记的是「当时那一行的 id」，而双表模型下行会被删除再搬运，id 空间还两张表各自递增——一篇内容改过几次、每次改了哪个字段，今天既没有列可查，也没有一条稳定的线索可聚合。
- 库里 `articles` 只有 1 条手工遗留行、没有覆盖草稿 / 已上线 / 已下线各形态的样例，资讯链无法端到端验收。

本 change 只打通**资讯**这一条链：富文本撰稿 → 草稿表/发布表分家 → 公开接口下发 → 官网新闻资讯列表与 `/article/:slug` 详情。产品链拆到 `product-content-flow`，两条链互不引用、互不阻塞：资讯链不碰 `products.specs` 的形态收紧与产品上下架端点，产品链也不跟着拆表。

## What Changes

> **2026-10-30 修订（第二次）。** 首轮「草稿表 + 发布表 + 线上行的待发布副本」已按 011 落地并 94/94 走查；本轮按需求方新口径改写为「一条资讯同时只存在于一张表，**线上内容只读且不可删除，唯一动作是下线**；下线整行搬回草稿表并带下线状态」，并新增「修改人 + 可按内容身份串联的改动记录」。下面每条已按修订后的口径写；被推翻的原口径见 `design.md` D10 的否决清单，落地顺序见 Migration Plan 第 10～13 步（迁移 012）。

- 新增能力 **`article-content-flow`**：资讯从撰稿到官网呈现的完整行为契约（富文本能力边界与清洗、三态状态机与全站统一命名、**未发布内容与线上内容分处两张表且一条条目同时只在其中一张、线上内容只读且不可删除**、正文非空下限覆盖创建与发布两条路径、分类删除跨两表保护、浏览计数语义与展示口径、引用关系的级联语义、每次修改记录操作人）
- 新增能力 **`content-view-structure`（资讯侧归属要求）**：资讯功能落成管理端与官网两个独立目录，正文编辑器为资讯目录私有子件；并确立「第三类内容按同一模板扩展」的规则
- 资讯正文改为**所见即所得富文本**撰写：Tiptap 3（`@tiptap/vue-3` + `@tiptap/starter-kit` + `@tiptap/extension-image` + `@tiptap/extension-placeholder`），工具栏用 Element Plus 按钮与 `@element-plus/icons-vue` 图标自绘，插图走共用素材选择器；可用格式按后端清洗白名单逐条裁剪，**不提供**对齐/字号/颜色/缩进/表格
- **BREAKING** 未发布内容与线上内容分到两张表，且**一条条目同时只存在于其中一张**：新增草稿表 `article_drafts`（`state` 区分草稿与已下线），`articles` 退化为「只放正在上线的条目」的只读发布表（`status` 恒为 1）。线上内容不可编辑、不可删除，界面上唯一动作是下线；**下线在同一个事务内把整行搬回草稿表并标 `state=2`**（内容不丢、浏览量与发布时间随行保留），**发布把未发布行整行搬进发布表并删除该行**（首次发布写发布时间，再发布不覆盖，浏览量不清零）。不存在「线上 + 副本并存」，因此也没有「是否存在未发布改动」这一概念
- **BREAKING** 管理端资讯接口按表拆签名：内容读写只作用于草稿表（`POST /articles/drafts`、`PATCH /articles/drafts/:draftId`、`DELETE /articles/drafts/:draftId`、`POST /articles/drafts/:draftId/publish`），线上侧只剩下线（`POST /articles/:id/unpublish`）；`DELETE /articles/:id` 保留在代码里但**不对外使用**（界面不渲染、文档标为运维兜底）；011 那版的 `POST /articles/:id/revision`（确保副本行）随本轮撤除。现有 `PATCH /articles/:id` 的「保存即生效」假设不再成立，管理列表一行只有一个 id 加来源标记
- **BREAKING** 线上内容转为只读：管理端对已上线条目**不再提供编辑与删除入口**，唯一动作是下线；直接对线上行发起编辑或删除的请求服务端一律拒绝。`DELETE /articles/:id` 保留在代码里但不对外使用，界面、文档与操作路径都不引用它；011 那版给运营用的「删除线上内容」与「放弃改动」两个动作一并消失
- **BREAKING** 资讯详情独立成一条路由 `/article/:slug`，与产品详情彻底分轴；地址规则由 `site-runtime-link-integrity` 承接（本轮已按两条独立路由修订其 D2、`page-routing` 与第 3/4 组）
- 新增**内容身份与修改记录**：两表各加 `uid`（跨表搬运与被删重建都不变、各表唯一）与 `updated_by`（最后修改人，与 `created_by` 并列、不改对外署名）；每条写入路径刷新 `updated_by`，并把本次改动字段（改前/改后值，正文只记长度与摘要）写入既有 `audit_logs`（`entity_type='article'`、`entity_id=uid`、首次启用 `diff` 列）；`GET /audit` 增加按 `uid` 精确过滤；管理列表加「修改人 / 修改时间」两列，编辑页显示「最后由 X 于 T 修改」并提供修改记录时间线
- 官网三个只读接口一律只查发布表，不 join 草稿表——「草稿不可见」由表结构承担，不再依赖每条 SQL 的过滤条件
- 详情所需的分类名称、相关推荐的分类与标签由详情接口一并提供，`/public/search` 的资讯分支补分类名 join；无值时返回空，官网删除全部 5 处 `'NEWS'` 写死兜底
- 资讯公开接口退出 `max-age` 响应缓存，改用协商缓存
- 浏览计数从 GET 移出，改显式上报端点并按访客窗口判重，并在详情元信息区给出展示口径
- 正文图片地址由服务端约束：站外图片在保存时被剥除并就地提示数量；清洗白名单不放宽
- 新建即发布同样以非空正文为下限；删除资讯分类时跨两表统计引用（在线的与草稿/已下线的都算），有引用则拒绝并返回占用数量
- 引用关系补齐级联：`article_view_dedupe.article_id` 对 `articles(id)` 建 `ON DELETE CASCADE`——无论删除走运维端点还是下线时的整行搬移，该条的浏览明细都被一并清理，不留孤儿行；代价是**下线会重置该条的 24 小时判重窗口**（同一访客在重新上线后可再计一次，本 change 接受这条有界偏差）
- 补齐验收数据：迁移 `012_article_online_readonly.sql` 在 011 的库上加 `uid`/`updated_by`/`state` 三列、把存量 `status=2` 的发布行回收进草稿表、把旧副本行降级为普通草稿并 `DROP COLUMN published_id`、把 `articles.status` 的 `CHECK` 收窄为只允许 1，并重排三形态种子（已上线两条、草稿一条、**已下线一条且带非零浏览量与历史发布时间**）；附成对反向脚本

## Capabilities

### New Capabilities

- `article-content-flow`: 资讯撰稿与发布流程、官网新闻资讯列表与资讯详情
- `content-view-structure`: 功能目录的归属、私有子件与扩展模板规则（本 change 交付资讯侧三条，产品侧由 `product-content-flow` 交付）

### Modified Capabilities

- `page-routing`: 由 `site-runtime-link-integrity` 建立且尚未实现。本 change 把它的「产品与资讯详情共用一条地址」改为「各用一条独立地址」，资讯侧形态为 `/article/:slug`

## Impact

- 前端新增依赖（对「不轻易新增 npm 依赖」的有意例外，已在 `openspec/config.yaml` 登记）：`@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder`（实测 3.32.0，传递依赖 `@tiptap/core`、`@tiptap/pm` 等）
- 新增文件：`buinessweb/src/views/admin/content/article/components/RichBodyEditor.vue`（正文编辑器，只挂在资讯编辑页内，产品目录与其他后台界面不引用）
- 后端：`backend/src/routes/content.ts`（管理端资讯接口按 D10 拆成两组——草稿组 `POST /articles/drafts`、`PATCH /articles/drafts/:draftId`、`DELETE /articles/drafts/:draftId`、`POST /articles/drafts/:draftId/publish`，线上组只留下 `POST /articles/:id/unpublish`（整行搬回草稿表）与保留但不对外使用的 `DELETE /articles/:id`；011 那版的 `POST /articles/:id/revision` 与 `has_unpublished_changes` 一并撤除，原 `PATCH /articles/:id` 与 `POST /articles/:id/publish`、`discard-draft` 维持撤销；`assertSlugFree`（[content.ts](../../../backend/src/routes/content.ts) 资讯段）扩为跨两表校验；正文下限与站外图片剥除落在草稿写入路径；管理列表改两表并集、回传 `id`/`origin`/`uid`/`state`/`updated_by` 姓名；写请求带 `uid` 做「行 id 与内容身份相符」的校验；资讯分类删除引用计数跨两表；状态文案常量 `ARTICLE_STATE_TEXT.published` 改为「已上线」；每个写路径刷新 `updated_by` 并向 `audit_logs` 写 `diff`）；`backend/src/routes/public.ts`（`/public/articles/:slug` 与相关推荐补分类名与标签、`/public/search` 资讯分支补分类名 join、资讯公开接口改协商缓存、GET 详情去掉写操作、新增 `POST /public/articles/:slug/view`、全部只查 `articles`）；审计查询 `GET /audit` 增加 `entityUid` 过滤参数
- 数据：011 已执行、不回改；新增迁移 `backend/sql/migrations/012_article_online_readonly.sql`（两表加 `uid UUID NOT NULL DEFAULT gen_random_uuid()` + `UNIQUE (uid)` 与 `updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`；`article_drafts` 加 `state SMALLINT NOT NULL DEFAULT 0 CHECK (state IN (0,2))`；`UPDATE … SET updated_by=created_by` 灌存量；`articles.status=2` 的整行回收进草稿表并置 `state=2`；旧副本行降级为普通草稿后 `DROP COLUMN published_id`；`articles.status` 的 `CHECK` 收窄为只允许 1；重排三形态验收种子），附成对反向脚本；`011_article_flow.sql` 自身与其反向脚本保留原样；同步 `backend/sql/schema.sql` 基线
- 前端目录重组（`git mv` 级别）：
  - `buinessweb/src/views/admin/content/{articles,article-edit,article-categories}.vue` → `buinessweb/src/views/admin/content/article/{index,edit,categories}.vue`
  - `buinessweb/src/views/website/{News,Article}.vue` → `buinessweb/src/views/website/news/{index,detail}.vue`
- 前端路由：`buinessweb/src/router/index.ts`（新增 `article-detail` 记录 `/article/:slug`，移除 `/news/:slug`；列表页 `/news` 与管理端 `content/*` 地址不动）——路由记录的增删归 C1 第 3 组，本 change 只负责 import 指向与组件
- 官网跳转：`buinessweb/src/website/sections/{SecNewsFeed,SecLatestNews}.vue`、`buinessweb/src/views/website/Search.vue` 中指向资讯详情的地址，与 C1 第 4 组同批改写；`router/index.ts` 中 `news` 列表的 `meta.title` 错别字「新闻咨询」已于 2026-10-29 订正为「新闻资讯」
- 类型与接口：`buinessweb/src/types/cms.ts`（`ArticleCategory` 补 `sort`；`ArticleAdminRow` 去 `published_id`/`draft_id`/`has_unpublished_changes`，改为单一 `id` + `origin` + `uid` + `updated_by`/`updated_by_name` + `updated_at`；`ArticleEditable` 去 `source`/`online_slug`；详情类型补分类名称与标签）、`buinessweb/src/api/cms.ts`（草稿组与线上组两组方法，方法名分别带 `draft`/`article` 前缀以表明 id 归属，写方法统一带 `uid`，删除 `ensureRevision`；不留旧签名别名）、`buinessweb/src/api/*` 的审计查询补 `entityUid` 参数
- 管理端界面：`buinessweb/src/views/admin/content/article/index.vue`（行按钮改按 `origin`+`state` 渲染——在线行只剩「查看」「下线」，草稿与已下线行给「编辑」「发布」「删除」；删除确认文案去掉「未发布改动会一并删除」；新增「修改人 / 修改时间」两列与行内「修改记录」时间线）、`edit.vue`（撤除 `ensureRevision` 与「放弃改动回到线上内容」，「保存改动」改回「保存」，头部显示「最后由 X 于 T 修改」，对在线条目进入编辑前先提示需先下线）
- 不改动：`products` 表与产品接口（产品链的 `010_product_flow.sql` 后已按同构双表拆出 `product_drafts`，那是产品链自己的落地，本 change 不参与也不依赖它）、`pages` 表与其 `content_json`/`draft_json` 双列范式、`backend/src/lib.ts` 的清洗白名单（富文本按它裁剪，不放宽 `style`/`class`）、装修区块模型与 `sectionRegistry`、素材库上传链路、`page-publication-approval` 的 `pages` 表流程
