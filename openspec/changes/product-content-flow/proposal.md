## Why

产品是官网唯二的业务内容链之一，而这条链今天是**零实现**：迁移目录里只有 `002/003/004/005/006/011/012`，本链计划中的 `010_product_flow.sql` 从未创建也从未执行，库里 `products` 为 **0 行**（2026-10-31 连库核对）。所以这不只是「补断链」，而是**第一次把产品链做实**——而它必须一次做对，因为资讯链刚刚用两轮迁移（`011` 建草稿表、`012` 才收拢成双表）才走通的正确模型，产品没有理由再走一遍弯路。

需求方本轮定下的口径是：**产品与资讯同构双表——已上架的产品不可编辑、不可删除，唯一动作是下架；下架后可以编辑，改完再上架。** 这条要求把上一版规划里「产品不做草稿分离、以下架为天然保护态、编辑上架中的产品即时生效」的决定整个推翻（该决定的原话还留在 `openspec/config.yaml` 与 `article-content-flow` 里，见 Impact）。

现状的断点，逐条读过代码：

> 下列引用均为**改造前**的文件与行号：产品段已按双表重写、三个产品 SFC 已随目录重组改名（旧路径不再存在）。当前契约见 `docs/接口文档.md` §4.5 与 design D1–D13。

- **改了不生效。** `PATCH /products/:id` 的字段映射表不含 `slug`（[content.ts:716-732](../../../backend/src/routes/content.ts)）：编辑表单里改标识、请求返回成功、库里一字不变。
- **形态靠前端临时兜。** `specs` 写入侧是 `z.any().default({})`（[content.ts:698](../../../backend/src/routes/content.ts)），列默认 `'{}'::jsonb`（[schema.sql:251](../../../backend/sql/schema.sql)），而官网详情按 `[{label,value}]` 有序数组渲染（[ProductDetail.vue:140-143](../../../buinessweb/src/views/website/ProductDetail.vue)）。
- **上下架不对称、且不可审计。** 资讯有 `publish`/`unpublish`，产品只有 `PATCH {status}`；列表页还是乐观翻转、成功后不核对服务端结果（[products.vue:62-64](../../../buinessweb/src/views/admin/content/products.vue)），编辑页把上下架做成一个 `el-switch`（[product-edit.vue:182](../../../buinessweb/src/views/admin/content/product-edit.vue)）。「正在上架的内容不许改」这条约束在现有模型里没有任何结构支撑。
- **没有跨表身份，也没有「谁改的」。** `products` 没有 `uid`、`updated_by`、`published_at`（[schema.sql:241-260](../../../backend/sql/schema.sql)）。而双表的发布与下架都是**删行**动作：行主键一变，审计历史就挂在没人能反查的 id 上。
- **删分类静默清空归属。** `DELETE /product-categories/:id` 是裸删除（[content.ts:672-675](../../../backend/src/routes/content.ts)），外键 `ON DELETE SET NULL` 直接把产品的分类归属抹成 NULL。
- **下架会切断询价线索。** `inquiries.product_id REFERENCES products(id) ON DELETE SET NULL`（[schema.sql:327](../../../backend/sql/schema.sql)）——下架删线上行，线索的产品归属被外键静默清空，重新发布还会换主键。这是产品双表相对资讯多出来的代价（资讯只有 `view_count` 级联，可用重置判重窗口接受）。
- **详情要的分类名称从来没人下发。** 公开详情接口是裸 `SELECT *` + 只含 `id,slug,name,cover_image` 的相关推荐（[public.ts:105-112](../../../backend/src/routes/public.ts)），只有 `category_id`；前端读 `product.category`（[ProductDetail.vue:104](../../../buinessweb/src/views/website/ProductDetail.vue)）与推荐项的 `r.category`（[:184](../../../buinessweb/src/views/website/ProductDetail.vue)），两处恒为 undefined → 稳定显示写死的 `'存储产品'`。列表接口反倒 join 了 `c.name AS category`（[public.ts:98](../../../backend/src/routes/public.ts)），所以列表正常、一进详情就冒假文案。
- **「即时生效」被响应缓存吞掉。** `/public/*` 统一带 `max-age`（[public.ts:35-41](../../../backend/src/routes/public.ts)，默认 60 秒），资讯侧已按接口显式改协商缓存（`negotiateCache` [:26-32](../../../backend/src/routes/public.ts)），产品分支一处都没接。
- **详情页显示的不是内容本身。** 头图区写死「产品详情 / 参数与卖点」（[:79-81](../../../buinessweb/src/views/website/ProductDetail.vue)），图集缺位时回落内置 `cube-closeup.png` 冒充真实产品（[:18](../../../buinessweb/src/views/website/ProductDetail.vue)、[:181](../../../buinessweb/src/views/website/ProductDetail.vue)），取数失败与查无此条合并成同一个 `notFound`（[:45](../../../buinessweb/src/views/website/ProductDetail.vue)、[:52](../../../buinessweb/src/views/website/ProductDetail.vue)）。

本 change 只打通**产品**这一条链：管理端录入 → 保存草稿 → 发布上架 → 官网产品中心列表与 `/product/:slug` 详情 → 下架 → 编辑 → 再上架，端到端可验收。资讯链拆在 `article-content-flow`，两条链互不引用、互不阻塞、各持自己的表与状态文案常量。

## What Changes

- 新增能力 **`product-content-flow`**：产品从管理端录入到官网产品中心列表与详情展示的完整行为契约——字段完整性、标识可变且跨表唯一、双表放置与线上只读、三态命名一致、形态（图集/规格/卖点）统一、描述富文本清洗后保存、状态即时影响官网、详情所需关联信息一并发下、分类删除跨表保护、下架不切断线索追溯
- 新增能力 **`content-view-structure`（产品侧归属要求）**：产品功能在 `views` 下落成管理端与官网两个独立目录，目录自足（含图集/规格/描述三个私有编辑器），产品实现不引用资讯实现
- **BREAKING** 产品改成双表模型：新增 `product_drafts`（草稿 + 已下架，可编辑可删除），`products` 收窄为「只放正在上架的行」（`status` 恒为 1，`CHECK (status = 1)`）。一条产品同一时刻只存在于一张表，没有副本列、没有「是否存在未发布改动」
- **BREAKING** 已上架产品**不可编辑、不可删除**：`POST /products` 与 `PATCH /products/:id` 移除，改为 `POST/PATCH/DELETE /products/drafts…` + `POST /products/drafts/:draftId/publish` + `POST /products/:id/unpublish`；`DELETE /products/:id` 保留在代码里但界面与文档都不对外使用
- **BREAKING** 每个写请求必须携带 `uid`，服务端校验「路径里的行 id 与提交的 uid 指向同一行」，不符即拒绝；审计按 `entity_type='product'` + `entity_id=uid` 记录并首次启用 `diff`
- **BREAKING** 产品的 `specs` 形态定为 `{label,value}` 有序数组（≤20），`gallery` ≤8、`highlights` ≤8；服务端读写校验，存量 `{}` 由迁移归一为 `[]`，超上限的行只统计报告、不自动截断
- **BREAKING** 编辑态允许修改标识（slug），服务端做格式校验与跨两表唯一性预检；官网详情地址随标识变化，旧标识立即不可访问（风险窗口在下架那一步，下架确认必须写清）
- **BREAKING** 产品详情独立成一条路由 `/product/:slug`，与资讯详情彻底分轴；本链先按「新旧两条并存、指向同一组件」的过渡形态挂出，`/products/:slug` 的移除归 `site-runtime-link-integrity` 第 3 组
- 三态中文称谓定为 **草稿 / 已上架 / 已下架**，由服务端常量 `PRODUCT_STATE_TEXT` 单一来源产出 `state_text`；移除编辑页的状态 `el-switch` 与列表的乐观 `PATCH {status}`
- 新增**只写排序值**的线上专用动作 `POST /products/:id/sort`（请求体 `{uid, sort}`，只更新 `sort` 与 `updated_by`，内容列与上架时间不动，审计记 `action='sort'`）——否则运营调一次产品中心顺序就要把产品逐个撤下官网
- 详细描述接入 Tiptap 所见即所得编辑，落在产品目录私有的 `DescriptionEditor.vue`，复用资讯链已安装的四个包、不引入第二个编辑器包、不抽两条链共用的编辑器基件；沿用同一份清洗规则（`sanitize` → `stripForeignImages`），被剥除的站外图片数量回传并就地提示；**描述为空不阻止发布**
- `products` 与 `product_drafts` 各加 `uid`（`UNIQUE`，搬运时随行带下去、MUST NOT 由列默认值重新生成）、`updated_by`、`published_at`；管理列表补「修改人 / 修改时间」两列与每页条数选择
- `inquiries` 新增 `product_uid`：询价提交时记下该线上行的 uid，线索列表按 uid 跨两表解析产品当前名称与标识；既有 `product_id` 外键与 `ON DELETE SET NULL` 语义保留不动
- 删除产品分类时统计**两张表**的引用（含草稿与已下架），非 0 返回 409 与「已上架 X 个、未上架 Y 个」的占用数量；`GET /product-categories` 回传同口径 `ref_count`
- 公开详情接口随详情返回分类名称，相关推荐子查询同步补分类名称；无分类返回 `null` 而非回落写死文案
- 产品公开只读接口（详情、列表、分类、搜索的产品分支）退出 `max-age`，改用 `no-cache` + 内容指纹 ETag 协商缓存，使「上架/下架即时生效」在响应缓存层面成立
- 移除详情与列表中的内置占位假数据与写死兜底文案（`cube-closeup.png`、`'存储产品'`、写死区头），无图即不渲染该区块，无内容即空态；查无此条与取数失败分离
- 补齐验收数据：`010_product_flow.sql` 种入 2 个产品分类与 4 条产品，覆盖**已上架字段完整 / 已上架仅封面 / 草稿 / 已下架带历史上架时间**四种形态

## Capabilities

### New Capabilities

- `product-content-flow`: 产品录入与双表流转（草稿 → 上架 → 下架 → 编辑 → 再上架）、官网产品中心列表与产品详情
- `content-view-structure`: 功能目录的归属与内聚规则（本 change 交付产品侧，资讯侧由 `article-content-flow` 交付同一能力）

### Modified Capabilities

- `page-routing`: 由 `site-runtime-link-integrity` 建立且尚未实现（0/64）。本 change 把它的「产品与资讯详情共用一条地址」改为「各用一条独立地址」，产品侧形态为 `/product/:slug`

## Impact

**数据（迁移先落地，否则按草稿 id 的端点与只查发布表的公开接口都跑不起来）**

- 新增 `backend/sql/migrations/010_product_flow.sql` + `010_product_flow.rollback.sql`：建 `product_drafts`；`specs` 列默认改 `'[]'` 并归一存量 + 超上限行统计报告；`products` 加 `uid`/`updated_by`/`published_at`；同一事务内回收 `status=0` 行到未上线表并收窄 `CHECK (status = 1)`；`inquiries.product_uid` 加列与回填；2 分类 + 4 产品四形态种子
- `backend/sql/schema.sql`：新表、新列、新约束与列注释同步（基线与迁移必须同批改，否则新环境按基线建库拿不到双表）

**后端**

- `backend/src/routes/content.ts` 产品段（落地后位于 [699-1224](../../../backend/src/routes/content.ts)，改造前是 653-737）按资讯段（[279-697](../../../backend/src/routes/content.ts)）同构重写：`PRODUCT_STATE_TEXT`（[:97](../../../backend/src/routes/content.ts)）、`PRODUCT_ONLINE_WRITABLE_COLUMNS`（只含 `sort`，[:779](../../../backend/src/routes/content.ts)）、`PRODUCT_PUBLISH_COLUMNS` 搬运清单（[:774](../../../backend/src/routes/content.ts)）、`assertProductSlugFree` 跨两表预检 + 标识格式校验、`assertProductDraftIdentity` / `assertProductOnlineIdentity` 同形实现、草稿 CRUD 与发布/下架/排序三端点、描述清洗与站外图片数量回传、`GET /products` 两表 `UNION ALL` 并集（[:1137](../../../backend/src/routes/content.ts)）、`GET /products/:id` 与 `GET /products/drafts/:draftId` 各读一张表、每条写路径刷新 `updated_by` 并写 `audit_logs.diff`（`fields` 只收录**值真的变了**的列，见 design D7.5）、分类 `ref_count` 跨两表与删除 409
- `backend/src/routes/public.ts`：`/public/products/:slug` 与相关推荐补分类名称 join（[public.ts:110-129](../../../backend/src/routes/public.ts)）、产品四个只读分支接 `negotiateCache`（[:26-32](../../../backend/src/routes/public.ts)，该钩子让显式设头的分支退出 [:35](../../../backend/src/routes/public.ts) 的 `max-age` 钩子）、`/public/search` 产品分支补分类名（[:233](../../../backend/src/routes/public.ts)）；一律只查 `products`
- `backend/src/routes/forms.ts`：`POST /forms/inquiry` 在产品写入时同时记 `product_uid`（[:98-120](../../../backend/src/routes/forms.ts) 的提交端点、[:166-167](../../../backend/src/routes/forms.ts) 的派生查询，入参 `productId` 不变 [:15](../../../backend/src/routes/forms.ts)）；线索列表 `GET /leads/inquiry` 按 uid 跨两表解析产品，派生 `product:{name,slug,origin,state_text}`（`attachLeadProduct` [:63-85](../../../backend/src/routes/forms.ts)）
- `backend/src/lib.ts`：清洗白名单与 `stripForeignImages` 不动（资讯段已在用，产品段复用同一份判断）

**前端目录重组（`git mv` 级别）**

- `buinessweb/src/views/admin/content/{products,product-edit,product-categories}.vue` → `buinessweb/src/views/admin/content/product/{index,edit,categories}.vue`
- 新增 `buinessweb/src/views/admin/content/product/components/{GalleryEditor,SpecsEditor,DescriptionEditor}.vue`（前两者从 279 行的 `product-edit.vue` 拆出，第三者本轮新写）
- `buinessweb/src/views/website/{Products,ProductDetail}.vue` → `buinessweb/src/views/website/products/{index,detail}.vue`
- `buinessweb/src/router/index.ts`：管理端三条与官网两条记录的 import 路径改指新目录，并**新增** `product-detail` → `/product/:slug`；`/products/:slug` 的移除归 C1 第 3 组
- `buinessweb/src/website/sections/{SecProductGrid,SecFeatureProducts}.vue`、`buinessweb/src/views/website/Search.vue` 中指向产品详情的地址改为代码生成 `/product/{slug}`，与 C1 第 4 组同批

**前端类型与客户端**

- `buinessweb/src/types/cms.ts`：`ProductAdminRow`（现 [157-174](../../../buinessweb/src/types/cms.ts)）改为两表并集行（`uid`/`origin`/`state`/`state_text`/`updated_by`/`published_at`），新增 `ProductEditable`、`ProductDraftPayload`，`specs` 由 `any` 收敛为 `{label,value}[]`；`ProductDetail` 补分类名称；`InquiryPayload` 一侧不破坏
- `buinessweb/src/api/cms.ts`：`cmsAdmin.products` 按双表签名重写（`drafts.create/update/remove/publish`、`getDraft`、`unpublish`、`setOnlineSort`、审计按 uid 取），移除产品编辑对 `PATCH {status}` 的依赖

**既有约定与相邻 change 的回写（漏掉就会「任务勾完、代码没做完」）**

- `openspec/config.yaml`：「已发布内容的编辑先落成未发布改动」这条项目级约定已被资讯 012 与本轮产品双表共同推翻，必须改写为「一条内容同一时刻只存在于一张表；已上线内容只读，编辑与删除只作用于未上线表；发布与下架都是事务内整行搬运」
- `openspec/changes/article-content-flow/design.md`：两处「产品链不做草稿分离」的陈述与它对 `010_product_flow.sql` 的范围描述随本轮失效，需订正措辞（不改资讯行为）
- `docs/接口文档.md`、`docs/后端执行文档.md`、`docs/前端执行文档.md`、`docs/数据结构文档.md`、`docs/service-design/01-frontend-buinessweb-design.md`：逐份回写双表端点、目录归属与表结构（tasks 第 7 组点名到文件）

**不改动**

- `articles`/`article_drafts` 与资讯接口、资讯的两个私有组件（含 `RichBodyEditor.vue`）
- 资讯详情的地址规则与 `view_count` 判重链路
- `pages` 表的 `content_json`/`draft_json` 双列范式与装修区块结构、`sectionRegistry` 的 props 形状
- 素材库上传链路、`backend/src/lib.ts` 的清洗白名单、`page-publication-approval`（C2）的审批流程
- 全局样式 `assets/website.css` 与设计 tokens（页面级微调留在各自 SFC 的 scoped style）
