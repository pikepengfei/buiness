## Context

产品链的现状（2026-10-31 逐一读过代码、接口与库）：

> **本节与 `proposal.md` 的「现状的断点」引用的是改造前的位置**：本链实现后 `content.ts` 的产品段整体重写、行号下移，三个产品 SFC 已随目录重组改名（`admin/content/products.vue` → `product/index.vue`、`product-edit.vue` → `product/edit.vue`、`website/ProductDetail.vue` → `website/products/detail.vue`，旧文件已不存在）。保留原路径与行号是为了让断点可复核，不作为当前代码的导航；改造后的口径以 D1–D13、`docs/接口文档.md` §4.5 与 `docs/数据结构文档.md` §2.6 为准。

- **产品链是 0 实现。** 迁移目录里只有 `002/003/004/005/006/011/012`，本链计划中的 `010_product_flow.sql` **从未创建也从未执行**；`products` 表 **0 行**（连库核对）。因此本链不存在「执行记录」需要保留——旧的单表口径可以直接改写，不像资讯链那样要另起迁移 012 来回避 011 的走查记录。
- 单表读写：`POST /products` 直接收 `status`（[content.ts:694-710](../../../backend/src/routes/content.ts)），`PATCH /products/:id` 的字段映射表**不含 `slug`**（[content.ts:716-732](../../../backend/src/routes/content.ts)）——编辑态改标识静默无效；没有 `publish`/`unpublish`，管理端列表用 `PATCH {status}` **乐观翻转**（[products.vue:62-64](../../../buinessweb/src/views/admin/content/products.vue)）；编辑页把上下架做成一个 `el-switch`（[product-edit.vue:182](../../../buinessweb/src/views/admin/content/product-edit.vue)）。
- `products.specs` 写入侧是 `z.any().default({})`（[content.ts:698](../../../backend/src/routes/content.ts)），列默认 `'{}'::jsonb`（[schema.sql:251](../../../backend/sql/schema.sql)），而官网详情按 `[{label,value}]` 渲染（[ProductDetail.vue:140-143](../../../buinessweb/src/views/website/ProductDetail.vue)）。
- `DELETE /product-categories/:id` 是裸删除（[content.ts:672-675](../../../backend/src/routes/content.ts)），外键 `ON DELETE SET NULL` 会静默清空归属；`status` 的 `CHECK (0,1)`（[schema.sql:255](../../../backend/sql/schema.sql)）。
- 产品表**没有** `uid`、`updated_by`、`published_at` 三列（[schema.sql:241-260](../../../backend/sql/schema.sql)），所以既没有跨表身份可用，也没有「首次上架时间」可言，「谁改了这条产品」只留在 `audit_logs.entity_id=行 id` 里。
- **公开详情接口不下发分类名称**：`/public/products/:slug` 是 `SELECT *` + 只含 `id,slug,name,cover_image` 的相关推荐（[public.ts:105-112](../../../backend/src/routes/public.ts)），而列表接口 join 了 `c.name AS category`（[public.ts:98](../../../backend/src/routes/public.ts)）；前端读 `product.category`（[ProductDetail.vue:104](../../../buinessweb/src/views/website/ProductDetail.vue)）与推荐项的 `r.category`（[:184](../../../buinessweb/src/views/website/ProductDetail.vue)），恒为 undefined → 稳定显示写死的 `'存储产品'`。
- `/public/*` 统一带 `max-age`（[public.ts:35-41](../../../backend/src/routes/public.ts)，默认 60 秒），资讯侧已按接口显式改协商缓存（`negotiateCache`，[public.ts:26-32](../../../backend/src/routes/public.ts)），产品分支一处都没接——「上架即时生效」在窗口内时快时慢。
- 详情页头图区写死「产品详情 / 参数与卖点」（[ProductDetail.vue:79-81](../../../buinessweb/src/views/website/ProductDetail.vue)），图集缺失回落 `cube-closeup.png` 冒充真实产品（[:18](../../../buinessweb/src/views/website/ProductDetail.vue)、[:181](../../../buinessweb/src/views/website/ProductDetail.vue)），取数失败与查无此条并入同一个 `notFound`（[:45](../../../buinessweb/src/views/website/ProductDetail.vue)、[:52](../../../buinessweb/src/views/website/ProductDetail.vue)）。
- 地址侧只有 `/products/:slug`（[router/index.ts:19](../../../buinessweb/src/router/index.ts)）；资讯链已按「新旧两条并存、指向同一组件」的过渡形态挂出 `/article/:slug`（[:22-23](../../../buinessweb/src/router/index.ts)），产品侧同形处理。
- 管理端三个产品界面仍是扁平文件（`products.vue` / `product-edit.vue` / `product-categories.vue`），资讯侧已落成 `admin/content/article/{index,edit,categories}.vue` + `components/`。
- `inquiries.product_id` 是 `REFERENCES products(id) ON DELETE SET NULL`（[schema.sql:327](../../../backend/sql/schema.sql)）——**这条决定了双表的代价**：下架要删线上行，线索的产品归属会被外键静默清空，而重新发布后新行主键还会变。

**本轮口径变更（需求方 2026-10-31 明确）。** 撤销本链此前「产品不做草稿分离、以下架为天然保护态、编辑上架中的产品即时生效」的决定，改为**与资讯链 012 同构的双表模型**：发布后的产品不可编辑、不可删除，唯一动作是下架；下架后可编辑，改完再上架。四条配套口径本轮同时定下：

1. 三态中文称谓用产品域术语 **草稿 / 已上架 / 已下架**（资讯链是 已上线/已下线，两条链的文案各自单一来源，不跨链共用常量）。
2. 线上行的内容列绝对只读，但**列表排序值 `sort` 例外**：提供一个只写 `sort` + `updated_by` 的专用动作，避免「调一次产品中心顺序要把产品逐个下架」。
3. 详细描述**保留现有文本域入口的同时**接入 Tiptap 所见即所得编辑，且**产品侧自建编辑器组件**，不引用资讯目录的私有件。
4. 下架删线上行的代价由数据侧兜住：**`inquiries` 增加 `product_uid`**，线索按内容身份而不是行主键追溯产品。

**模板与边界。** `article-content-flow` 的 D10/D13/D14 与迁移 012、后端资讯段（[content.ts:277-651](../../../backend/src/routes/content.ts)）是本轮逐条照抄的对象：搬运列清单显式写出、`uid` 必带做身份相符校验、列表取两表 `UNION ALL`、审计首次启用 `diff`。依赖关系不变：本链仍依赖 `site-runtime-link-integrity`（C1）的地址白名单与严格 404；与资讯链唯一可能重叠的文件是 `router/index.ts` 与 `public.ts` 的缓存钩子，边界见 D2 与 D6。

## Goals / Non-Goals

**Goals:**

- 打通产品「录入 → 保存 → 发布上架 → 官网列表 → 官网详情 → 下架 → 编辑 → 再上架」，一条产品同一时刻只存在于一张表，**正在上架的那一行不可编辑、不可删除，唯一动作是下架（外加只改排序值的专用动作）**
- 线上内容永不被半成品覆盖：编辑半成品不可能出现在官网，因为要改必须先让它离开官网
- 每条产品带一个跨表稳定的身份（`uid`）与「最近由谁改动」的记录（`updated_by`），谁在何时改了哪些字段可从审计日志按同一条产品串起来看
- 修掉四处真实契约缺陷：标识静默丢弃（收敛为服务端生成且冻结，见 D5）、规格形态漂移、详情分类名缺失、上下架动作缺失
- 让「状态即时生效」在响应缓存层面成立，而不只是接口层
- 详细描述按清洗后的富文本保存，做到「编辑器产出 = 清洗后保留 = 官网渲染」
- 引用关系跨两表统计：分类删除保护把草稿与已下架一并算进去；询价线索在下架与再发布后仍能追溯到同一条产品
- 产品功能落成管理端与官网两个独立目录，与资讯实现零相互引用
- 补上可验收的产品种子数据（四形态各有样例行：已上架字段完整、已上架仅封面、草稿、已下架带历史上架时间与自定义排序）

**Non-Goals:**

- 不做资讯正文的图片归属规则之外的富文本能力扩展（表格、对齐、颜色、字号一律不放开，理由同资讯链 D9）
- 不做「线上内容 + 待发布副本」并存：一条产品同一时刻只在一张表里，没有副本列，也没有「是否存在未发布改动」这个状态
- 不给已上架内容提供删除入口：`DELETE /products/:id` 保留在代码里但界面与文档都不对外使用，删除一律作用于未上线表
- 不做产品的浏览计数（资讯有 `view_count` 与判重表，产品没有这项要求，本链不新增）
- 不做定时发布、批量操作、多语言版本、产品分类层级维护界面（后端 `parent_id` 已支持，UI 缺入口——另案）
- 不改 `articles`/`article_drafts` 与资讯接口，不改 `pages` 表的 `content_json`/`draft_json` 双列范式，不改装修区块结构
- 不把富文本编辑器抽成两条链共用的组件（见 D9 的否决清单）

## Decisions

### D1 产品详情独立成一条路由 `/product/:slug`，与资讯详情彻底分轴

`router/index.ts` 为两条详情各注册一条独立记录：`product-detail` → `/product/:slug` → `views/website/products/detail.vue`；`article-detail` → `/article/:slug`（资讯链已落）。过渡形态与资讯侧同形：**本链新增 `/product/:slug` 记录，`/products/:slug` 的移除归 C1 第 3 组**，两条并存、指向同一组件，避免在 C1 仍未实现（0/64）时把官网详情地址悬空。列表页地址 `/products` 不变。

被否决的替代方案：

- **`/option/:type/:slug` 一条形态、两个组件**——`type` 段是两条链的共享约定，新增第三类内容要先改白名单，与「彻底分轴、各自闭环」冲突。
- **`/option/product/:slug` + `/option/article/:slug`（同一前缀拆两条）**——前缀无语义，两链地址仍共用一段痕迹。
- **只保留 `/products/:slug`**——零迁移，但列表 `/products` 与详情 `/products/:slug` 同段嵌套，`has-sub` 与面包屑判定要特例处理；且推翻 C1 的地址规则同样要改它的第 3/4 组，省不下返工。

命名风险记录在案：`/product/:slug` 与列表 `/products` 只差一个 `s`。缓解方式是 C1 的固定白名单——错拼落进兜底 404 而不是渲染半页；本链把站内所有产品链接改为代码生成，不靠运营手敲。

### D2 两个功能目录的布局与文件命名

| 目录 | 文件 | 由何而来 |
|---|---|---|
| `views/admin/content/product/` | `index.vue` `edit.vue` `categories.vue` `components/GalleryEditor.vue` `components/SpecsEditor.vue` `components/DescriptionEditor.vue` | `views/admin/content/{products,product-edit,product-categories}.vue`，图集与规格控件从 279 行的 `product-edit.vue` 拆出，描述编辑器本轮新拆 |
| `views/website/products/` | `index.vue` `detail.vue` | `views/website/{Products,ProductDetail}.vue` |

`git mv` 保留历史。`router/index.ts` 的归属边界：**列表页与管理端界面的 import 路径由本链改**；`/product/:slug` 记录的旧记录移除归 C1 第 3 组。样式继续写在各自 SFC 的 scoped style，不动 `assets/website.css` 与全局 tokens（项目约定）。

被否决的替代方案：按「list / detail / edit」分层建公共目录（把产品与资讯混在同一层，正是要消除的相互抄近路）；只重命名不拆子组件（`product-edit.vue` 继续膨胀，图集、规格、富文本三个控件挤在一个 279 行文件里）。

### D3 未上线内容独立成表：`product_drafts`（可编辑）+ `products`（只读线上）

草稿与线上分家落在**两张表**上，而不是同一张表的两列或一个布尔标记，且**一条产品永远只在其中一张表里**（与资讯链 D10 同构，列名与动作语义按产品域调整）：

| 表 | 里面有什么 | 谁能写 |
|---|---|---|
| `products`（发布表） | **只放正在上架的产品**，一行 = 一份线上内容；`status` 恒为 1 | 三个动作：发布（新行落表）、下架（整行搬走）、调整排序值（只写 `sort`）；内容编辑动作拿不到它的写路径 |
| `product_drafts`（未上线表） | 从未上架的产品 + **已下架回收的产品**（靠本表 `state` 列区分，0=草稿 / 2=已下架） | 所有内容编辑动作、草稿删除，以及草稿侧的排序值编辑 |

三种形态由此唯一确定：

- **草稿**：只在未上线表、`state=0`；从未上架，官网不可见
- **已上架**：只在发布表；**只读**——不给内容编辑入口，也不给删除入口，界面上可做的是「查看 / 下架 / 调整排序」
- **已下架**：只在未上线表、`state=2`；等同于「一条可以编辑、可以删除、可以重新发布的条目」，与草稿的区别只有一个状态标签与「曾上架」的身份

配套规则（逐条与资讯链对齐，差异处点名）：

- **编辑**只作用于未上线表的行（`state=0` 或 2）。已上架产品要先「下架」才能改：下架把发布行整行搬进未上线表并置 `state=2`，此后编辑写的就是这一行
- **不存在「线上 + 副本并存」这种形态**：没有 `has_unpublished_changes`、没有 `published_id`、没有「确保副本行」端点、界面上没有「发布改动 / 放弃改动回到线上内容」
- **发布**：一个事务内把未上线行的固定列清单（标识、名称、分类、系列、封面、图集、摘要、描述、规格、卖点、价格文案、购买链接、排序值）搬成发布行 → 删除未上线行 → 发布行 `status=1`、`published_at = COALESCE(随行带下来的值, NOW())`、`created_by/created_at` 原样带下来、`uid` 原样带过去。**首次上架写上架时间，之后每次再上架都不覆盖它**
- **下架**：一个事务内把发布行整行搬进未上线表（含 `published_at`、`sort`、`created_*`、`uid`，置 `state=2`）→ 删除发布行 → 官网该标识立即 404。内容不丢，只是换表存放
- **删除**只有一种：删未上线表的行。发布表的 `DELETE /products/:id` **保留在代码里但不对外使用**，界面不渲染指向它的按钮
- **编辑页取数就是它所在的那一行**——「存进去读不到」在这种单份内容搬运模型下天然闭合
- **管理列表是两张表的并集**，一条产品恰好一行：`origin`（`online` / `draft`）+ `id` + `state`（`draft` / `published` / `offline`）+ `uid` + `updated_by` 姓名 + `sort` + `published_at` + `created_at`
- **官网三个只读接口（列表、详情、搜索）一律只查 `products`**，MUST NOT join 或 union `product_drafts`

**与资讯链的两处结构差异**，都写进 spec 而不是靠实现自觉：其一，产品**没有浏览计数**，所以下架删线上行不会像资讯那样级联清空判重明细，也就不需要「重新上线重置判重窗口」这类代价条款；其二，产品**有 `inquiries.product_id` 外键**，下架删线上行会把线索的产品归属置空，代价由 D8 的 `product_uid` 兜住。

**id 选择规则**：未上线侧动作按草稿行 id——`POST /products/drafts`、`PATCH /products/drafts/:draftId`、`DELETE /products/drafts/:draftId`、`POST /products/drafts/:draftId/publish`（首次发布与下架后重新发布同一入口）；线上侧动作按发布行 id——`POST /products/:id/unpublish`、`POST /products/:id/sort`、`DELETE /products/:id`（保留、不对外使用）。每个写请求 MUST 同时带 `uid`。

被否决的替代方案：

- **`products.draft_json` 差量列**（资讯链 D10 的最早方案同款）——迁移最省，但「哪一列属于线上」是靠每个读写点自觉遵守的隐式约定，漏一处就把半成品写上线上。双表把这条契约交给数据库本身。
- **`status=0` 留在发布表表达下架**（本轮改造前的现状，也是本链上一版的 D5）——线上行既能被 `status` 改动、又留在官网可见集合的边缘，删除与编辑的收口都要额外加判据；已被需求方推翻：「发布的产品不可编辑删除，只可以下线，下线后可以编辑再上线」。
- **一张表加布尔列 `is_draft`**——两态混在一列时标识唯一索引要改成部分索引，唯一性判定反而要跨两态推理；两张表名正言顺，`CHECK` 各收各的。
- **保持「产品不做草稿分离」**（本链上一版的 Non-Goal）——它的成立前提是「下架即保护态」，但改价、改规格也要先把产品撤下官网，与运营诉求相反；需求方要求与资讯同构，本链照做。

### D4 三态语义与命名单一来源，判据是「在哪张表 + 未上线表的 `state`」

`PRODUCT_STATE_TEXT = { draft: '草稿', published: '已上架', offline: '已下架' }`，服务端单一常量产出，接口回传 `state_text`，前端筛选、行内按钮、表单只读标注引用同一份（键名与类型形状与 `ARTICLE_STATE_TEXT` [content.ts:76](../../../backend/src/routes/content.ts) 对齐，**文案不同**：产品用上架/下架）。判据不看 `products.status` 一列（它恒为 1）：草稿 = 未上线表 `state=0`；已上架 = 发布表有行；已下架 = 未上线表 `state=2`。也就是说「下架」既是状态也是位置。新建默认草稿（`state=0`）且不写上架时间；`published_at` 只在首次发布写入并随后续搬运随行保留。

`status` 列保留不删：公开接口与既有索引（`idx_products_public`、`idx_products_status`）都按 `status=1` 过滤，收窄 `CHECK` 后它退化为「这行是否在线」的存在性证明，读法不变，改动面最小。

编辑页不再有状态开关：现状的 `el-switch`（[product-edit.vue:182](../../../buinessweb/src/views/admin/content/product-edit.vue)）与列表的 `PATCH {status}` 乐观翻转（[products.vue:62-64](../../../buinessweb/src/views/admin/content/products.vue)）一并撤除，状态只能由新建 / 发布 / 下架三个动作产生。

被否决的替代方案：沿用资讯链的「已上线 / 已下线」文案（与产品域习惯相反，且要把现有界面文案整体重写）；把三态压成两态（丢掉草稿能力，运营录产品必须在上架前借别处暂存）；用 `status=0` 表达草稿（D3 已否决）。

### D5 标识由服务端在创建时生成，一经生成即冻结

标识不再是运营的输入项：`POST /products` 在落库前生成 `p-{6 位 [a-z0-9]}` 短码写入 `slug`，并随创建响应（`{id, uid, slug, stripped_images}`）下发给管理端只读回显；`PATCH /products/drafts/:draftId` 的映射表**移除 `slug`**，前端也不提交。此前「PATCH 映射不含 slug 但创建与草稿编辑可写 slug」是同一份契约里两处相反的说法，运营打错一个字符就得删了重建，且改标识即改官网地址、让已发布的地址与外部物料失效——冻结从根上消掉这个风险窗口。已上架标识本来就不许原地改（与「线上只读」冲突），现在把同一条约束扩到所有状态，界面也不再需要「待生效地址」与改标识后果确认。

唯一性由**生成时的占用判定**承担，不再需要跨表预检函数：`isContentSlugTaken(products, product_drafts, slug)` 走 `SELECT … UNION ALL`，两张表都查过才用；重试上限内每次都撞车就放手让 INSERT 去碰 `UNIQUE (slug)`，全局 23505 → 409（`app.ts` 兜底），MUST NOT 静默换一个近似值——一次创建给出两个不同标识比创建失败更难解释。搬运（发布/下架）仍在事务内做同标识冲突判定（`slug_online` / `slug_draft` 两条 kind），因为存量手工填写的标识可能本来就互相冲突，那是搬不动的历史事实，不能因为改了生成方式就假装不存在。

格式规则由生成器自身保证（小写字母、数字与连字符、长度上限），不再需要 zod 层的 `SLUG_RE`——外部提交的 slug 被 schema 删除后由 zod 默认剥离，写不进库。分类标识同形处理（`pc-` 前缀，占用判定只查 `product_categories` 一张表）。

替代方案与否决理由：**拼音/中文转写生成**（多音字与生僻字不可靠，中文名转出一长串既不可读也更容易撞车，且项目约定不为此新增 npm 依赖）；**保留输入框只加默认值**（运营仍可改成任意字符串，格式与唯一性校验、后果确认弹窗一概删不掉）；**外部提交 slug 返回 400**（为一个本该不存在的字段开出校验与测试路径，老客户端整笔请求失败，比静默丢弃更难排障）；**为旧标识自动跳转**（与 C1「不做自动跳转」冲突，后端不托管 SPA 也给不出真 301）；**迁移存量标识成统一短码**（等于批量改官网地址，需求方已确认不动存量）。

### D6 线上行的唯一可写列是 `sort`，走独立端点而非通用编辑

需求方要「线上不可编辑」，也要能调整产品中心顺序。取舍是把 `sort` 从「内容列」里单独摘出来，给它一个只写这一列的专用动作：`POST /products/:id/sort`，请求体 `{ uid, sort }`，服务端在同一处校验身份相符（D7）后只更新 `sort` 与 `updated_by`，`published_at`、状态与所有内容列不动，审计记 `action='sort'`、`diff={fields:['sort'],from:{sort},to:{sort}}`。幂等：重复提交同一个值与提交一次结果相同。未上线行的 `sort` 仍是普通可编辑列，走 `PATCH /products/drafts/:draftId`。

本链 **MUST NOT** 给线上行开任何其它列的写路径，也 MUST NOT 复用资讯链没有先例的「批量排序」端点（`registerReorder` 目前只覆盖分类/Banner/菜单/FAQ [content.ts:1438-1456](../../../backend/src/routes/content.ts)）。

被否决的替代方案：**sort 也只允许下架后改**（模型最纯净，但运营每调一次顺序就要把产品逐个撤下官网、改完再发布，期间官网 404，是把「排序」这项运营日常绑死在「改内容」的代价上）；**给线上行加 `draft` 副本承载排序改动**（那就是被推翻的「线上 + 副本并存」）；**把 sort 也做进 `PATCH`**（通用编辑端点会顺带获得改写内容列的能力）。

### D7 内容身份 `uid`、最后修改人 `updated_by` 与审计留痕

落点四条（第 5 条是审计的收录口径），都不新建历史表（与资讯链 D13 同形）：

1. **`updated_by`**：两表各加 `BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`，与既有 `created_by` 并列，列注释写明「最后修改人，不是创建人」。建草稿、保存、发布、下架、调整排序、删除每条写路径都刷新为 `req.user.id`；下架与发布的搬运把当次操作人写进目标行。管理列表新增「修改人 / 修改时间」两列，编辑页头部常驻「最后由 X 于 T 修改」。
2. **`uid`**：两表各加 `UUID NOT NULL DEFAULT gen_random_uuid()` 与 `UNIQUE (uid)`。**同一条产品在两表之间搬动时 uid 不变**——发布把草稿行的 uid 带进发布行，下架把发布行的 uid 带回草稿行。搬运语句 MUST NOT 让它走列默认值重新生成（一条内容换身份 = 审计历史断线）。两表各自的 `UNIQUE (uid)` 还让「同一份内容两处存在」在结构上不可能。
3. **写请求必带 `uid`**：两表主键各自递增，`drafts/7` 与 `products/7` 可以同时存在，服务端 MUST 校验「路径里的行 id 与提交的 uid 指向同一行」，不符即拒绝——把「传错 id」从静默改到别的内容降级为一次报错（照抄 `assertDraftIdentity` [content.ts:389-398](../../../backend/src/routes/content.ts)）。
4. **改动明细走既有审计**：`entity_type` 统一为 `product`（不出现 `product_draft`），`entity_id` 写 **uid**，`diff` 填 `{ fields, from, to }`；`description` 这类长字段只记长度与摘要而不整份存。`GET /audit` 的 `entityUid` 过滤参数资讯链已实现（[content.ts:1467-1471](../../../backend/src/routes/content.ts)），产品侧复用，不加新端点。
5. **`fields` 只收「值真的变了」的列**：保存动作收到的是整份表单，若把「本次提交的列」一律写进 `diff`，一次改价会记成 13 个字段各 `x → x`，时间线读不出重点。写入侧照样逐列 `UPDATE`（幂等，且顺带刷 `updated_by`），只是比较 `diffKey()` 归一化后的值才决定是否入 `diff`。归一化是必需的：`category_id` 是 BIGINT，驱动回 `'12'` 而客户端提交 `12`，`jsonb` 又会重排对象键序——按字面量比会把没动的规格表判成改动。**资讯侧仍是「提交即入 diff」**（[content.ts:449-463](../../../backend/src/routes/content.ts)），这条不对称登记在 `article-content-flow` 的修订清单里，本链不代改那侧行为。

被否决的替代方案：只加 `updated_by` 不做 uid（发布与下线都是**删行**动作，行一删历史就挂在没人能反查的 id 上）；新建 `product_revisions` 快照表（本链没有任何「回到上一版」的要求）；复用行 id 显式回插（发布表主键由序列生成，靠「这个 id 一定没被占用」的推理不可靠）。

### D8 迁移 010：双表 + 状态收窄 + 形态归一 + 线索身份 + 四形态种子

`010_product_flow.sql` 从未执行，本链的旧 D9（只改 `specs` 默认值与种数据）作废，一个脚本一次做完七件事（下面六项内容动作 + 存量纯文本包 `<p>`，见 D9 末段），反向脚本逐条成对：

1. **建 `product_drafts`**：列与 `products` 的内容列一一对应（`slug`、`name`、`category_id`、`series`、`cover_image`、`gallery`、`summary`、`description`、`specs`、`highlights`、`price_text`、`buy_link`、`sort`），另有 `uid UUID NOT NULL UNIQUE`、`state SMALLINT NOT NULL DEFAULT 0 CHECK (state IN (0,2))`、`published_at`、`created_by`、`updated_by`、`created_at`、`updated_at` 与 `updated_at` 触发器；`slug` 本表内 `UNIQUE`，`category_id` 沿用 `ON DELETE SET NULL`。两表列注释各写明「本表内容是否对外可见」。
2. **形态归一**：`products.specs` 列默认 `'{}'::jsonb` → `'[]'::jsonb`，并把存量 `{}` 行改写为 `[]`（幂等）；同时统计 `specs`/`highlights`/`gallery` 数组长度超过上限（20/8/8）的行并 `RAISE NOTICE` 输出清单，**不自动截断**，由运营确认。
3. **加列到 `products`**：`uid`（`UNIQUE`）、`updated_by`、`published_at`；`updated_by` 按 `created_by` 回填一次（`WHERE updated_by IS NULL AND created_by IS NOT NULL`，`created_by` 为空留 NULL，界面显示占位符）。
4. **回收已下架行并收窄状态**（同一事务）：先做同 `slug` 冲突预检（`RAISE EXCEPTION` 输出清单，不静默改名），再把 `products.status=0` 的整行按列插进 `product_drafts` 并置 `state=2`，删除这些发布行，最后 `DROP CONSTRAINT products_status_check` + `ADD CHECK (status = 1)`、`ALTER COLUMN status SET DEFAULT 1`。本地库 `products` 是 0 行，这一步在项目内是空搬移但 `CHECK` 实打实生效；`DROP CONSTRAINT IF EXISTS` 兜住该约束在某些环境本不存在的形态。
5. **`inquiries.product_uid`**：`ALTER TABLE inquiries ADD COLUMN product_uid UUID NULL` + 索引，并按 `product_id` 关联 `products` 回填当时的身份标识；`product_id` 外键与其 `ON DELETE SET NULL` 语义**不动**（下架后 `product_id` 会置空，这是本模型接受的既成事实，`product_uid` 才是追溯线）。重复执行不改变已补记的行。
6. **种入四形态验收数据**：按 `WHERE NOT EXISTS`（按 uid 与标识双重判存）幂等种入产品分类 2 个 + 产品 4 条——① **已上架、字段完整**（规格 3 项、卖点 2 条、图集 2 张、价格文案、购买链接、富文本描述含小标题与有序列表）；② **已上架、仅封面**（验收「无数据即不渲染」与无描述可上架）；③ **草稿**（无分类无价格，验收官网不可见）；④ **已下架**：`product_drafts.state=2`，带历史 `published_at` 与自定义 `sort`（验收「下架后内容仍在、可编辑、可重新发布且上架时间与排序延续」）。标题与摘要冠「示例」，图片引用现有 `public/website/img/prod/*.png`，正文只使用清洗白名单内的标签。

`backend/sql/schema.sql` 基线同步新表、新列、新约束与注释，并登记 010 与 011→012 的先后关系（仅编号连续、无执行顺序依赖）。与 `011/012`（资讯链）动的是不同表与不同约束，**互不依赖执行顺序**。

替代方案：拆成「010 建表 + 013 双表」两个脚本（资讯链那样做是因为 011 已执行、需要保留走查依据；本链 0 执行记录，拆两段只会让「现在应该是什么样」再次阅读困难）；让运营手工录数据（验收要等素材到位）；与资讯链共用一份迁移（拆链后任一侧回滚要连带另一侧）。

### D9 产品详细描述接入 Tiptap，编辑器组件产品侧私有

`description` 从「纯文本 textarea」升级为所见即所得富文本：新增 `views/admin/content/product/components/DescriptionEditor.vue`，落在本链目录内。已安装的 Tiptap 3 四个包（`@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder`，资讯链 D9 已登记为「不轻易新增依赖」的例外）**复用同一份，不引入第二个编辑器包**。现有文本域入口的字段位置与提交字段名不变，编辑器接管的是同一个 `description` 值。

能力边界仍由后端清洗规则反推，与资讯链同一份判断：`Heading` 限 `h2/h3/h4`，`TextAlign`/`TextStyle`/`Color`/`Highlight`/`Indent` 不装（靠 `style`/`class` 表达而 `style` 全剥、`class` 只在 `img` 上保留），`Table` 不装（`colwidth` 会被剥，存下来必然失真）；图片只从 `MediaPicker` 选取，不提供直传或外链输入。写入侧沿用资讯的清洗链 `sanitize` → `stripForeignImages`，剥除的站外图片数量随响应回传并就地提示（[lib.ts](../../../backend/src/lib.ts) 的两个函数资讯段已在用）。**描述为空不阻止发布**（与资讯「正文非空是下限」不同）：产品可以在只有封面、摘要与规格的情况下上架，官网按「无数据即不渲染」处理。

存量纯文本：迁移里把不含任何标签的 `description` 包成 `<p>`（幂等判定为「原值不含 `<`」），本地库 0 行，这一步是为别的环境写的。

被否决的替代方案：

- **把编辑器的公共部分抽到 `src/components/` 供两链共用**——要动资讯链已经落地但**从未浏览器实测**的 `RichBodyEditor.vue`，把一条链的未验证改动耦合进另一条链；也要改 `openspec/config.yaml` 里「跨目录只共用接口客户端、类型与区块渲染器」这条约定。两条链各持一份薄封装的代价是约 150 行相似代码，换的是零跨链耦合，符合「彻底分轴」的既有取向。
- **描述继续用 textarea**（改动面最小，但需求方本轮明确要求富文本编辑）。
- **放宽清洗白名单以支持表格与颜色**——等于为编辑器重写安全边界，与资讯链同一结论。

### D10 详情所需的关联信息由详情一次性下发，产品公开接口退出 `max-age`

两处改动合在一个决策里，因为它们修的是同一次请求（与资讯链 D5 同形）：

1. `/public/products/:slug` 与它的相关推荐子查询 `LEFT JOIN product_categories` 返回分类名称；分类为空时返回 `null`，前端按空值隐藏标识，删除 `|| '存储产品'` 兜底。列表接口已有该 join（[public.ts:98](../../../backend/src/routes/public.ts)），形态对齐。
2. 产品的公开只读接口（详情、列表、分类、搜索的产品分支）改协商缓存 `no-cache` + ETag，直接复用 `negotiateCache`（[public.ts:26-32](../../../backend/src/routes/public.ts)）：未变更时 304 不重复传输，变更后立刻可见。该钩子按「处理器显式设头即豁免」的现有机制（[public.ts:37](../../../backend/src/routes/public.ts)）工作，产品分支与资讯分支各自显式设头，互不覆盖。

**双表下的读取边界**：这些接口一律只查 `products`，MUST NOT join 或 union `product_drafts`。草稿泄漏到线上的可能性由数据库结构本身排除——未上架与已下架的产品在发布表里根本没有行，`status` 又恒为 1，所以「草稿不可见」不再依赖每条 SQL 记得写过滤条件。

替代方案与否决理由：前端再发一次 `/public/product-categories` 自行映射 id→名称（多一次往返，且推荐项的分类名仍拿不到）；只把 `max-age` 调小（把「即时」降级成「延迟可控」，spec 断言仍不成立，验收时快时慢）；给公开接口彻底关掉缓存（丢掉 304 复用）；让官网接口按状态回退去读未上线表（那等于把未上架内容漏进线上，正是要消除的）。

### D11 分类删除在应用层拦截，引用数跨两表统计

删除前统计该产品分类下的引用数，**两张表都要算**——`products`（正在上架的）与 `product_drafts`（草稿与已下架的）各有一份 `category_id`，漏掉未上线表就会删掉「只有草稿在用」的分类，那些行的归属被静默清空。非 0 返回 409 + 中文占用数量（实测文案「该分类下还有 N 个产品（已上架 X 个、未上架 Y 个），请先移动或删除后再删分类」），照抄资讯侧的写法（[content.ts:304-318](../../../backend/src/routes/content.ts)）；`GET /product-categories` 同步回传 `ref_count`（跨两表求和），使列表显示的数字与删除检查同一口径。两张表的 `ON DELETE SET NULL` 保持原样，作为绕过应用层直接改库时的兜底。

替代方案：外键改 `RESTRICT`（错误信息不可读，属破坏性 DDL，且对已有脏数据不友好）；只统计发布表（草稿与已下架内容的归属会被静默清空）。

### D12 询价线索按内容身份追溯，不靠行主键

下架删线上行会让 `inquiries.product_id` 被外键置空（[schema.sql:366](../../../backend/sql/schema.sql)），重新发布还会换主键——行 id 在这套模型里不是可靠的追溯线。落法：

1. `inquiries` 加 `product_uid UUID NULL`（迁移 D8 第 5 步），存量按 `product_id` 回填。
2. `POST /forms/inquiry`（[forms.ts:159](../../../backend/src/routes/forms.ts) 起，入参 `productId` 见 [:15](../../../backend/src/routes/forms.ts)）在产品写入时**同时**记下该线上行的 `uid`（同事务内按 `product_id` 查 `products` 取 `uid`，[:166-167](../../../backend/src/routes/forms.ts)）；查不到行就只记 `product_id`（可能为 NULL），不猜、不因此拒绝提交。
3. 管理端线索列表（`GET /leads/inquiry`）按 `product_uid` 跨两表解析产品当前名称、标识与状态（`products` 优先，回落 `product_drafts`，[:63-85](../../../backend/src/routes/forms.ts)），派生出 `product: {name, slug, origin, state_text}` 下发；文案同样取 `PRODUCT_STATE_TEXT`，所以已下架是「已下架」、纯草稿是「草稿」，而不是笼统的「未上线」。解析不到（内容被删）时 `product=null`，读侧不会拿到一个指向别处的空壳。**本链只做到下发**：[admin/leads/index.vue](../../../buinessweb/src/views/admin/leads/index.vue) 未渲染这一列，界面呈现归线索页自身的后续改动。
4. 行主键外键与 `SET NULL` 语义**保留不动**：`product_id` 表达「提交时指向哪一行」，`product_uid` 表达「追的是哪一条内容」，两列并存而不是改造外键（改造既有 FK 属破坏性 DDL，且 `product_id` 对「同一次询价的当时快照」仍有意义）。

被否决的替代方案：什么都不做，只写进风险（库里虽 0 行，但需求方本轮明确要「加 `product_uid`」，且这不是不能避免的损失而是可一次性补住的缺口）；把 `product_id` 外键改成引用 `uid`（UUID 单列不能同时引用两张表，FK 只能指一张，改了指向就断）；给 `product_drafts` 也建一个被 `inquiries` 引用的 FK（同上一条理由，且要双写两条外键）。

### D13 页面级三态与列表级空态分层，互不吞并

官网产品中心页遵循 C1 的规则：装修页未发布 → 整页品牌化 404；装修页已发布但列表区块取到 0 条 → **页面正常呈现 + 列表区空态**；列表请求失败 → 列表区可重试错误态。详情的「查无此条」与「取数失败」同样分两层，杜绝把失败并入 `notFound` 的旧写法——现状是两个独立标志位 `notFound` / `failed`（[products/detail.vue:20-21](../../../buinessweb/src/views/website/products/detail.vue)、分支在 [:62-81](../../../buinessweb/src/views/website/products/detail.vue)、模板 [:102-110](../../../buinessweb/src/views/website/products/detail.vue)），改造前它们挤在同一个 `notFound` 里（原 `ProductDetail.vue:45`/`:52`，文件已随目录重组删除）。已下架产品的详情地址必须 404 **且不泄漏任何该产品的字段**。双表让这个分层有了结构支撑：草稿在发布表里根本没有行，「未上架内容不可经地址访问」不再是一条要靠 SQL 写对的规则，而是查不到就是查不到——与资讯链 D8、C1 给装修页定的「未发布即不可见」同构。

替代方案：0 条即 404（新建分类、临时下架全部产品时官网出现死页）；失败也显示空态（掩盖故障，与 C1「失败与无内容必须可区分」冲突）。

## 对既有 change 与项目约定的修订（本轮落笔）

- **`openspec/config.yaml`** 的「保存与发布是两个动作：已发布内容的编辑先落成未发布改动」这条约定已被资讯链 012 与本轮产品双表共同推翻，改写为「一条内容同一时刻只存在于一张表；已上线内容只读，编辑与删除只作用于未上线表；发布与下架都是事务内整行搬运」。**不改这条约定，两条链的实现都会与项目级约定相抵触。**
- **`article-content-flow`** 的两处陈述随本轮失效，需同步订正（不改其行为，只改措辞）：`design.md` 依赖关系段写「产品链不做草稿分离，本 change 的双表只动资讯」、D12/修订清单写「产品侧仍不做草稿分离（该链的 Non-Goals 不变）」——两句都改为「产品链已按同构双表落地，两链各自持有表与常量」；它对 `010_product_flow.sql` 的描述（「specs 默认值 + 种子」）范围已扩大为「双表 + 形态归一 + uid/updated_by/published_at + inquiries.product_uid + 四形态种子」。
- **标识生成方式落定后残留的一条不对称（本轮不处理，登记在此）**：内容域四张表（产品/资讯及其未上线表、两类分类）的标识都由服务端生成并冻结，但装修页 `pages.slug` 仍是运营手填、schema 只有 `min(1).max(80)` 且无格式校验（[content.ts:229](../../../backend/src/routes/content.ts) 的 `pageSchema.slug`，配合 [content.ts:207-211](../../../backend/src/routes/content.ts) 的 `assertSlugFree('pages', …)`）。它决定的是装修页地址而不是内容地址，归 C2/装修链 own，本轮不动。原先「资讯链 spec 写格式要求与产品一致而实现只有 min/max」这条不对称随两链都改成服务端生成而消失。
- **C1 `site-runtime-link-integrity`**：`/product/:slug` 的地址断言与 `/products/:slug` 的移除仍归它的第 3/4 组（0/64 未实现）。本链按 D1 的过渡形态新增 `/product/:slug` 记录，两条并存，不代替 C1 删除旧记录。
- **C2 `page-publication-approval`**：只管 `pages` 表，本链不动它；`/product/:slug` 的取数仍读 `products` 正式列。
- **`decoration-editor-toolkit`**：`SecProductGrid` / `SecFeatureProducts` 的跳转地址改写归本链第 6 组（与 C1 第 4 组同批改写），装修区块的属性表单不接富文本。

## Risks / Trade-offs

- [「小改一个字也要先下架」会产生官网空窗] → 下架确认里点名后果（「下架后官网立即 404，改完需再发布才恢复」），并提供「发布」作为下架后唯一的回归路径；这是本次接受的代价——用一段可预期的空窗换「线上内容永不被半成品覆盖」。被否决的替代是「留一份待发布副本」，已在 D3 的否决清单里。
- [下架删线上行会把 `inquiries.product_id` 置空] → D12 的 `product_uid` 承担追溯，`product_id` 保留「提交当时」的语义；迁移先回填再改表，验收按「下架—再上架后线索仍指到同一条内容」判定。
- [`sort` 开了线上写路径，后来者容易把它当成「线上行可以 PATCH」的口子] → 端点只有一条 `UPDATE ... SET sort, updated_by`，`PRODUCT_ONLINE_WRITABLE_COLUMNS` 在代码里显式只有 `sort` 一个值并写明理由；spec 用「绕过界面直接改线上内容被拒」与「调整排序不改内容」两条场景各封一边。
- [搬运清单漏列，某字段搬过去丢了；或把 `uid` 交给列默认值，历史断线] → 发布与下架都用显式列对列的 `INSERT … SELECT`，`uid`/`sort`/`published_at`/`created_*`/`updated_by` 逐一写出；清单同时写进迁移注释与 spec 场景，正向断言「改了必上线」，反向断言「下架再上架后上架时间、排序与修改历史都延续」。
- [搬运不是原子的：插了草稿行却删发布行失败，一线上出现两条同内容] → 两个动作各包在单事务里，两表 `UNIQUE (uid)` 让「同一条内容两表都有行」最多停留到事务结束即被约束回滚；不写「先删后插」的中间态。
- [双 id 混淆：界面把线上行 id 传给编辑或删除，动作落到不该动的条目] → 一行只有一个 id 与一个 `origin`，按钮形态**只由 `origin` 与 `state` 渲染**；写请求 MUST 带 `uid`，服务端校验相符，不符即拒绝。走查覆盖「数字相同但来自另一张表的 id 互不命中」。
- [`products` 与 `product_drafts` 的 `UNIQUE (slug)`：新建靠生成时的占用判定，但「下架时草稿侧已有同标识行」是另一条路径] → 存量手工填写的标识仍可能互相冲突，搬运事务内保留同标识判定：下架先查 `product_drafts` 同 `slug`、发布先查 `products` 同 `slug`，冲突返回 409 给可读原因，不静默改名（照抄资讯侧 [content.ts:649-651](../../../backend/src/routes/content.ts)）。新建路径不再需要跨表预检，因为标识是生成出来的。
- [分类标识换成不透明短码后，官网分类筛选地址（`?category=…`）从可读词变成 `pc-xxxxxx`] → 服务端按非数字分支解析（[public.ts:11-13](../../../backend/src/routes/public.ts) 的 `categoryCond`），功能不变；已分享出去的老筛选地址落到空态而不是报错，走查覆盖「按新标识筛选命中、对不上的标识返回空列表」。存量分类标识不迁移，老地址在存量分类上继续有效。
- [`audit_logs.entity_id` 的语义在产品上从「行 id」变成「uid」，同一张表里混着两种口径的历史行] → 只影响 `entity_type='product'`，按该类型过滤即自洽；010 之前记行 id 的历史行不回填、不与 uid 混查，时间线顶部注明「修改记录自本次修订起」。
- [管理列表要并两表两状态，排序与分页容易写出重复行或漏行] → 取数集中在一个查询函数：两表 `UNION ALL` 后统一 `ORDER BY (updated_at, origin, id)` 全序再分页，两表 `id` 空间不重叠但带上表名作来源标记；验收含「分页重复/遗漏」与「三态筛选各只出自己那批」。
- [`inquiries` 加列与回填是破坏性 DDL] → `ADD COLUMN ... NULL` 无默认值不重写表；本地 0 行，回填语句按 `WHERE product_uid IS NULL AND product_id IS NOT NULL` 幂等；反向脚本 `DROP COLUMN`。
- [收窄 `products.status` 的 `CHECK` 是破坏性 DDL，别的环境若真有 `status=0` 行会失败] → 先搬后改、同事务；同 `slug` 冲突整笔中止并输出清单（本地 0 行是空搬移，但脚本必须写出来）。
- [Tiptap 用于产品描述与资讯「编辑器私有」的既有边界冲突] → 两链各持一份薄封装、互不 import（D9 否决清单写明为什么不抽公共件）；共用的是 npm 包与清洗规则，不是组件。
- [specs 收紧上限后，历史超长数据保存失败] → 迁移阶段统计超限行、不截断，在验收清单里点名由运营确认。
- [关掉 `max-age` 后公开接口 QPS 上升] → 协商缓存保留 304，响应体不重复传输；本项目为官网展示站，量级可承受。
- [与 C1 的实现顺序耦合] → C1 未完成时，本链详情按 D1 的双记录过渡形态验证渲染正确性，只有「旧地址不可访问」的断言推迟到 C1 之后。
- [产品链与资讯链都动 `router/index.ts` 与 `public.ts`] → 归属边界见 D2 与 D10：路由记录的增删归 C1，本链只加自己的记录并改 import；缓存钩子按接口分支各自显式设头。

## Migration Plan

**执行顺序有硬依赖**：数据迁移必须先落地，按草稿 id 读写的端点与只查发布表的公开接口才跑得起来；后端契约必须与前端调用同批发布，因为管理端点签名是破坏性改动。

1. 数据：执行 `010_product_flow.sql`（建 `product_drafts`、`specs` 归一与超限统计、products 加 `uid`/`updated_by`/`published_at`、回收 `status=0` 行并收窄 `CHECK (status = 1)`、`inquiries.product_uid` 回填、2 分类 + 4 产品四形态种子），同步 `backend/sql/schema.sql` 基线；核对发布表只剩 `status=1`、两表 `uid` 各自不重复、`state` 只有 0/2、被回收行的 `published_at` 与 `sort` 随行到达未上线表
2. 后端未上线侧契约：`POST/PATCH/DELETE /products/drafts`、`POST /products/drafts/:draftId/publish`、标识由服务端生成（`p-` 短码 + 跨两表占用判定）且写入路径不含 slug、`specs`/`highlights`/`gallery` 形态收紧、描述清洗与站外图片剥除数量回传（`backend/src/routes/content.ts` 产品段）
3. 后端线上侧契约：`POST /products/:id/unpublish`（整行搬运）、`POST /products/:id/sort`（只写排序）、`DELETE /products/:id` 保留并标注不对外使用、移除 `POST /products` 与 `PATCH /products/:id`；`GET /products` 换两表并集并回传 `uid`/`origin`/`state`/`state_text`/`updated_by`；写请求统一带 `uid` 做身份校验；`PRODUCT_STATE_TEXT` 常量；每条写路径刷新 `updated_by` 并把 `diff` 写进 `audit_logs`（`entity_type='product'`、`entity_id=uid`）；分类 `ref_count` 与删除保护跨两表
4. 后端下发契约：`/public/products/:slug` 与相关推荐补分类名称、产品公开接口改协商缓存、`/public/search` 产品分支补分类名 join（`backend/src/routes/public.ts`）；询价落 `product_uid`、线索列表按 uid 解析产品（`backend/src/routes/forms.ts`）
5. 前端类型与客户端：`types/cms.ts` 的 `ProductAdminRow`/`ProductEditable`/`ProductDraftPayload`、`api/cms.ts` 的 `cmsAdmin.products` 按双表签名重写、补 `setOnlineSort` 与按 uid 取审计
6. 前端目录：`git mv` 成两个目录，拆出图集/规格/描述三个子组件，修 `router/index.ts` 的 import 并新增 `/product/:slug` 记录，`vue-tsc` 通过
7. 管理端产品：列表两态按钮与三态筛选、每页条数选择、修改人与修改时间列、行内「调整排序」、编辑页三态（新建/编辑/只读查看）与「保存 / 保存并发布」、下架与改标识的后果确认、描述编辑器接入、分类引用数与 409 提示、「修改记录」时间线
8. 官网产品中心：去写死区头与占位图与 `'存储产品'` 兜底、描述按清洗后 HTML 渲染、四处「无数据即不渲染」、三层状态、筛选与分页落地址、地址指向 `/product/:slug`
9. 文档与约定回写：`openspec/config.yaml` 与 `article-content-flow` 的两处陈述，加 `docs/` 下四份执行文档与 service-design（**逐文件点名，见 tasks 第 7 组**）
10. 验证：`tsc` / `vue-tsc`；新场景走查（录入→保存→重开仍是我的内容且线上无变化→发布→线上一次到位→**线上行尝试编辑/删除必须被拒**→只改排序生效且内容列不动→下架→官网 404 且内容在未上线表→编辑→再发布→上架时间与排序延续、修改记录串到同一 `uid`→删除只作用于未上线行→线索仍可追溯）

回滚：前端目录重组、下发契约、写入契约、数据迁移各自独立提交，可单独 `git revert`（回退描述编辑器后正文仍是清洗过的 HTML，编辑器只是退回文本域）。数据侧执行 `010_product_flow.rollback.sql`（删种子、`DROP COLUMN inquiries.product_uid`、把 `state=2` 行搬回发布表并恢复 `CHECK (0,1)` 与默认 1、`DROP TABLE product_drafts`、`products` 撤掉 `uid`/`updated_by`/`published_at`、`specs` 默认回 `'{}'`），**回退迁移必须与后端回退同批**——只回退迁移而保留后端，按草稿 id 的端点会因表不存在而硬失败。**回退后端但保留双表数据是安全的**：发布表内容从未被编辑动作改过，官网读到的仍是已上架内容。审计里的 `diff` 与 `entity_id=uid` 一旦落库不回滚（`audit_logs` 只增不改）。缓存头回退即恢复 `max-age`，不动数据。

## Open Questions

- 已下架（`state=2`）与新建草稿（`state=0`）同表同列，列表当前只靠状态筛选区分。是否需要默认分组（「未上架」与「已下架」两段），还是与资讯链保持「一张表一条列表」（暂不处理，等运营用出反馈）
- `DELETE /products/:id` 保留但不对外使用：只靠「界面不渲染」是否够，还是要给它一个独立权限位（现有 `content:write` 已覆盖它，任何能写内容的角色直接调接口都能删线上行）——与资讯链同一个未决问题，两条链一起定夺更合适
- 「调整排序」是否也要支持跨行的批量拖拽（`registerReorder` 目前没有 products 分支；本链只做单行专用动作，批量另案）
- 产品是否需要「置顶/推荐」这类独立于 `sort` 的权重（当前只有 `sort`）
- 正式产品图与描述配图由谁提供、走素材库上传还是沿用 `public/website/img/` 内置资产（本链先用内置资产占位）
- `price_text` 与 `buy_link` 是否需要校验天猫/京东域名白名单，还是纯文本自由填（当前只限制长度与 `rel` 隔离）
- 修改记录时间线放列表行内展开还是放编辑页侧栏（资讯链选了编辑页对话框，本链暂随同，两条链一致优先）
