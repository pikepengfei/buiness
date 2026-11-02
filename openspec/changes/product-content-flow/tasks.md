## 1. 数据：迁移 010 把双表落地

> 迁移必须先执行：按草稿行 id 读写的端点、只查发布表的公开接口、`status` 恒为 1 的读法都依赖它。本链 `010` 从未创建也从未执行，所以一次做完六件事，不拆「010 建表 + 013 双表」两段（资讯链拆是因为 `011` 已执行、要保留走查依据）。

- [x] 1.1 新增 `backend/sql/migrations/010_product_flow.sql`：建 `product_drafts`，内容列与 `products` 一一对应（`slug` `name` `category_id` `series` `cover_image` `gallery` `summary` `description` `specs` `highlights` `price_text` `buy_link` `sort`），另有 `uid UUID NOT NULL UNIQUE`、`state SMALLINT NOT NULL DEFAULT 0 CHECK (state IN (0,2))`、`published_at`、`created_by`、`updated_by`、`created_at`、`updated_at` 与 `updated_at` 触发器；本表内 `UNIQUE (slug)`，`category_id` 沿用 `ON DELETE SET NULL`（脚本头部幂等：`CREATE TABLE IF NOT EXISTS`）
- [x] 1.2 同脚本：`products.specs` 列默认 `'{}'::jsonb` → `'[]'::jsonb`，并把存量 `{}` 行归一为 `[]`；同时统计 `specs`/`highlights`/`gallery` 长度超过 20/8/8 的行，`RAISE NOTICE` 输出 id+slug+超长项清单，**不自动截断**（留给运营确认，写进 10 组验收）
- [x] 1.3 同脚本：`products` 加 `uid UUID NOT NULL DEFAULT gen_random_uuid()` + `UNIQUE (uid)`、`updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`、`published_at TIMESTAMPTZ NULL`；`updated_by` 按 `created_by` 回填一次（`WHERE updated_by IS NULL AND created_by IS NOT NULL`）
- [x] 1.4 同脚本、**同一事务内**：先做同 `slug` 冲突预检（存在冲突 `RAISE EXCEPTION` 输出清单，不静默改名）→ 把 `products.status=0` 的整行按列插进 `product_drafts` 并置 `state=2`，`uid`/`sort`/`published_at`/`created_by`/`created_at` 逐列写出（MUST NOT 让 `uid` 走列默认值）→ 删除这些发布行 → `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check` + `ADD CHECK (status = 1)` + `ALTER COLUMN status SET DEFAULT 1`
- [x] 1.5 同脚本：`inquiries` 加 `product_uid UUID NULL` + 索引，按 `product_id` 关联 `products` 回填既有行的 uid（`WHERE product_uid IS NULL AND product_id IS NOT NULL`，幂等）；`product_id` 外键与其 `ON DELETE SET NULL` 语义**不动**
- [x] 1.6 同脚本：按 `WHERE NOT EXISTS`（uid 与 slug 双重判存）幂等种入 2 个产品分类 + 4 条产品，覆盖四形态——① `products` 已上架且字段完整（规格 3 项、卖点 2 条、图集 2 张、`price_text`、`buy_link`、富文本描述含小标题与有序列表）② `products` 已上架、仅封面（验收「无数据即不渲染」与「无描述可上架」）③ `product_drafts` 草稿 `state=0`、无分类无价格 ④ `product_drafts` 已下架 `state=2`、带历史 `published_at` 与自定义 `sort`；种子 uid 用固定值（便于反向脚本与重复执行判定），标题/摘要冠「示例」，图片引用现有 `buinessweb/public/website/img/prod/*.png`，正文只用清洗白名单内的标签
- [x] 1.7 新增 `backend/sql/migrations/010_product_flow.rollback.sql`：删种子行与种子分类 → `DROP INDEX`/`DROP COLUMN inquiries.product_uid` → 把 `state=2` 行搬回 `products` 并恢复 `CHECK (status IN (0,1))` 与默认 1 → `DROP TABLE product_drafts` → `products` 撤 `uid`/`updated_by`/`published_at` → `specs` 默认回 `'{}'`；脚本注释写明与正向脚本的执行顺序，以及「审计日志的 `diff` 与 `entity_id=uid` 不回滚」
- [x] 1.8 同步 `backend/sql/schema.sql`：新表、新列、新约束、列注释（每条列注释写明「本表内容是否对外可见」），并登记 010 与 011→012 仅编号连续、无执行顺序依赖；核对基线与 010 执行后的实际库结构一致（新环境按基线建库必须直接得到双表）
- [x] 1.9 执行方式确认（本机无 `psql` 时用 node + `pg` 跑脚本，凭据从环境变量取，不把连接串写进任何提交物）；执行后核对：`products` 只剩 2 行且 `status` 全为 1、`product_drafts` 2 行（`state` 各为 0 与 2）、两表 `uid` 各自不重复、`specs` 无 `{}` 残留、种子分类各有产品引用
- [x] **验证**：正向 → 反向 → 再正向跑一遍，结果与首次正向一致（幂等）；`products_status_check` 存在且只允许 1；`inquiries.product_uid` 有索引；backend `npx tsc --noEmit` 通过（此步只验迁移未破坏既有编译）

## 2. 后端：未上线侧写入契约（草稿 CRUD + 三个动作）

> 逐条照抄资讯段的结构：`draftCreateSchema`/`draftPatchSchema`/`DRAFT_FIELDS`（[content.ts:293-312](../../../backend/src/routes/content.ts)）、`assertArticleSlugFree`（[:326-343](../../../backend/src/routes/content.ts)）、`assertDraftIdentity`（[:346-355](../../../backend/src/routes/content.ts)）、发布事务（[:452-516](../../../backend/src/routes/content.ts)）、下架（[:599-637](../../../backend/src/routes/content.ts)）。

- [x] 2.1 定义 `PRODUCT_PUBLISH_COLUMNS` 搬运清单（`slug,name,category_id,series,cover_image,gallery,summary,description,specs,highlights,price_text,buy_link,sort`）与 `PRODUCT_ONLINE_WRITABLE_COLUMNS`（**只有 `sort`**），两个常量在代码里各写明「为什么」，发布/下架两条 `INSERT … SELECT` 都按清单逐列写出
- [x] 2.2 定义 `PRODUCT_STATE_TEXT = { draft:'草稿', published:'已上架', offline:'已下架' }`（键形与 `ARTICLE_STATE_TEXT` [content.ts:68](../../../backend/src/routes/content.ts) 对齐、**文案不同**）；定义 `productState(origin, state)` 单点判态（同 [:321](../../../backend/src/routes/content.ts)）
- [x] 2.3 标识校验落地：`slugField` zod 同时校验格式（`^[a-z0-9]+(-[a-z0-9]+)*$`、长度上限）与必填；`assertProductSlugFree` 跨两表预检（`SELECT 'online' FROM products WHERE slug=$1 UNION ALL SELECT 'draft' FROM product_drafts WHERE slug=$1 AND id IS DISTINCT FROM $2`），区分「撞线上」与「撞别的草稿」给不同中文提示；两张表各留 `UNIQUE (slug)` 兜并发，23505 转 409 而不是 500（分类标识 `category slug` 同规则）
- [x] 2.4 `POST /products/drafts`：不收 `status`、不收 `state`（上线只能由发布产生）；写 `uid`、`created_by`、`updated_by`、`state=0`；`created_at`/`updated_at` 由库生成
- [x] 2.5 形态收紧（替换 `specs: z.any()` [content.ts:698](../../../backend/src/routes/content.ts)）：`specs` 为 `{label,value}[]`（≤20，`label` 必填）、`highlights` ≤8、`gallery` ≤8；非数组、对象形态、缺参数名在写入前拒绝；`{}` 在读侧归一为 `[]`（配合 1.2），并在响应里回传归一后的形态
- [x] 2.6 描述清洗：`cleanProductDescription` 沿用资讯的清洗链 `sanitize` → `stripForeignImages`（[lib.ts](../../../backend/src/lib.ts)，白名单不放宽：`style` 全剥、`class` 只在 `img` 上保留、无表格/对齐/颜色）；被剥除的站外图片数量随响应回传；**描述为空不阻止发布**（与资讯「正文非空是下限」不同，此处显式不校验）
- [x] 2.7 `PATCH /products/drafts/:draftId`：请求必带 `uid`，先 `assertDraftIdentity`；按 `DRAFT_FIELDS` 白名单逐字段更新并刷新 `updated_by`；改 `slug` 时走 2.3 的跨表预检；每次改动写 `audit_logs`（`action='update'`、`entity_type='product'`、`entity_id=uid`、`diff={fields,from,to}`，`description` 只记长度与摘要，同 `bodyDigest` [:75-88](../../../backend/src/routes/content.ts)）——`diff.fields` 只收**值真的变了**的列：整份表单回写时未动的列照样写入但不进审计，否则「保存一次像改了 13 个字段」；比对用归一化键（BIGINT 列驱动回字符串、jsonb 会重排键序，直接比字面量会把没动的列判成改动）
- [x] 2.8 `DELETE /products/drafts/:draftId`：必带 `uid`（query 或 body 与资讯侧同形 [:432](../../../backend/src/routes/content.ts)）；只作用于未上线表；审计记 `action='delete'`
- [x] 2.9 `POST /products/drafts/:draftId/publish`：单事务内「行锁草稿 → 跨表标识占用复核 → 按 `PRODUCT_PUBLISH_COLUMNS` 插入发布行（`uid` 原样带过去、`status=1`、`published_at=COALESCE(随行值, NOW())`、`created_by/created_at` 原样带下来）→ 删除草稿行 → 记 `updated_by`」；首次上架写上架时间，之后每次再上架都不覆盖它；并发重复发布只有一个成功（`UNIQUE (slug)`/`UNIQUE (uid)` 转 409）；响应回新发布行 id
- [x] 2.10 `POST /products/:id/unpublish`：单事务内先查 `product_drafts` 同 `slug` 冲突（冲突返回 409 给可读原因，不静默改名，同 [:607-608](../../../backend/src/routes/content.ts)）→ 整行搬进未上线表并置 `state=2`（含 `published_at`、`sort`、`uid`、`created_*`）→ 删除发布行 → 官网该标识立即查不到；审计 `action='unpublish'`
- [x] 2.11 `POST /products/:id/sort`：请求体 `{uid, sort}`，`assertDraftIdentity` 同形的线上行身份校验后**只**更新 `sort` 与 `updated_by`；`published_at`、`status` 与所有内容列不动；审计 `action='sort'`、`diff={fields:['sort'],from:{sort},to:{sort}}`；重复提交同值结果与提交一次相同（幂等）
- [x] 2.12 移除 `POST /products`（[:694-710](../../../backend/src/routes/content.ts)）与 `PATCH /products/:id`（[:716-732](../../../backend/src/routes/content.ts)）；`DELETE /products/:id`（[:733](../../../backend/src/routes/content.ts)）保留但在注释里标注「运维用途、界面与文档不对外使用」
- [x] 2.13 backend `npx tsc --noEmit` 通过
- [x] **验证**（curl，逐条走 spec 场景）：提交带 `status`/`state` 被拒 · `specs` 传对象形态被拒且不落库 · 13 项规格被拒 · 标识含大写或中文被拒 · 草稿撞线上标识返回「撞线上」文案 · 发布后草稿表无行且发布行 `uid` 与草稿一致、`published_at` 首次非空 · 同一草稿并发发布两次只有一个成功 · **对发布行调用保存/删除被拒** · 只调 `sort` 后内容列与 `published_at` 逐列比对未变 · `uid` 与行 id 不符的每一次写都被拒

## 3. 后端：线上只读、两表并集列表、身份与分类跨表保护

- [x] 3.1 `GET /products/drafts/:draftId` 返回编辑所需的完整字段（含 `gallery`/`specs`/`highlights`/`description`）与 `state_text`、`updated_by_name`、`readonly` 判定所需的 `origin`
- [x] 3.2 `GET /products/:id`（线上行）返回同一形状但 `readonly=true` + `readonly_hint`（「已上架产品只读，需先下架才能修改」），字段完整可用于「查看」页
- [x] 3.3 `GET /products` 换成两表 `UNION ALL` 并集（照抄 [:521-559](../../../backend/src/routes/content.ts)）：一行一产品，回传 `origin`/`id`/`uid`/`state`/`state_text`/`slug`/`name`/`series`/`category`/`cover_image`/`price_text`/`sort`/`updated_by`/`updated_by_name`/`updated_at`/`published_at`/`created_at`；状态筛选按三态（草稿 / 已上架 / 已下架）映射到「表 + `state`」判据；排序与分页写成全序 `ORDER BY (updated_at, origin, id)` 后分页，杜绝重复行与漏行
- [x] 3.4 关键词与分类筛选对并集生效（分类沿用 id/slug 双形参的 `categoryCond` 逻辑），分页 `meta` 三要素正确
- [x] 3.5 分类删除保护改为**跨两表**统计（[:672-675](../../../backend/src/routes/content.ts) 的裸 `DELETE` 前加计数）：`products` 与 `product_drafts` 各算一份，非 0 返回 409 + 「线上 X 条、未上线 Y 条」；外键 `ON DELETE SET NULL` 保留作兜底
- [x] 3.6 `GET /product-categories` 回传同口径跨两表 `ref_count`（显示数字与删除检查同一来源，同 `ArticleCategoryAdminRow` 的做法）
- [x] 3.7 核对 `GET /audit` 的 `entityType` + `entityUid` 过滤（[:972-993](../../../backend/src/routes/content.ts)）无需改动即可串出产品时间线；`entity_type` 统一为 `product`（不出现 `product_draft`）
- [x] 3.8 每条写路径（建/改/删/发布/下架/排序）都刷新 `updated_by = req.user.id`，并确认权限中间件对六个端点都要求 `content:write`（只有 `content:read` 的角色调用一律 403；403 分支走的是与资讯链同一个 `requirePerm`，产品侧按 preHandler 映射逐条核对，未另造中间件）
- [x] 3.9 backend `npx tsc --noEmit` 通过
- [x] **验证**：并集列表三态筛选各只出自己那批、翻页无重复无遗漏（本地实测 `status=0/1/2` 分别命中 1/2/1 条、不传时 4 条各一行） · 草稿与线上行 id 相同数字时互不命中（拿 `product_drafts.id` 调 `POST /products/:id/unpublish` 必须失败） · 删有引用分类被拒且数量与列表显示一致 · 删空分类成功 · 未登录访问管理端产品接口 401 · 仅 `content:read` 账号写请求 403 · `GET /audit?entityType=product&entityUid=` 能串出「建 → 改 → 发布 → 排序 → 下架 → 改 → 再发布」且不中断

## 4. 后端：产品下发契约与询价线索追溯

- [x] 4.1 `/public/products/:slug`（[public.ts:105-112](../../../backend/src/routes/public.ts)）补 `LEFT JOIN product_categories` 返回分类名称，与列表接口 `c.name AS category`（[:98](../../../backend/src/routes/public.ts)）形态一致；无分类返回 `null` 而非空串
- [x] 4.2 同端点的相关推荐子查询补每一项的分类名称，字段与列表接口对齐（推荐项当前只有 `id,slug,name,cover_image`）
- [x] 4.3 `/public/products/:slug` 显式列出返回列（当前是 `SELECT *`），排除 `created_by`/`updated_by` 等运营侧字段
- [x] 4.4 产品三个公开只读接口（详情、列表、分类）+ `/public/search` 的产品分支改走 `negotiateCache`（[:26-32](../../../backend/src/routes/public.ts)）：显式设 `cache-control: no-cache` + 内容指纹 ETag，使这些分支退出统一 `max-age` 钩子（[:35-41](../../../backend/src/routes/public.ts)）；ETag 前缀用 `prod-list`/`prod-one`/`prod-cat`/`search` 与资讯分支区分，未变更返回 304
- [x] 4.5 核对官网四个产品接口一律只查 `products`，MUST NOT join 或 union `product_drafts`（grep 检查一次，把「草稿不可见」交给表结构而不是每条 SQL 的过滤条件）
- [x] 4.6 `/public/search` 产品分支补分类名 join（[:214-230](../../../backend/src/routes/public.ts) 当前只有 `id,slug,name,cover_image,summary`），使搜索结果卡片不再回落写死文案
- [x] 4.7 `POST /public/inquiries`（[forms.ts:13](../../../backend/src/routes/forms.ts)）在写入 `product_id` 的同时按该 id 查 `products` 记下 `uid` 到 `product_uid`；查不到行只记 `product_id`（可为 NULL），不猜、不报错
- [x] 4.8 管理端线索列表 `GET /leads/:kind` 按 `product_uid` 跨两表解析产品当前名称与标识（`products` 优先、回落 `product_drafts`），下架期间给出一条非空指向而不是空值；返回字段向后兼容（新增字段，不改既有字段名）。**实测口径收窄**：解析在接口层完成（`attachLeadProduct` 返回 `product:{name,slug,origin,state_text}`，[forms.ts:63-85](../../../backend/src/routes/forms.ts)；类型 [cms.ts:396](../../../buinessweb/src/types/cms.ts)），状态称谓取 `PRODUCT_STATE_TEXT` 的实际值（下架期间是**「已下架」**，不是本条原写的「未上线」，也不新造第四种称谓）；[admin/leads/index.vue](../../../buinessweb/src/views/admin/leads/index.vue) 目前不渲染这一列，界面呈现归线索页自身的后续 change，本链不代它改布局
- [x] 4.9 backend `npx tsc --noEmit` 通过
- [x] **验证**：上架→下架→再上架各请求一次详情与列表，响应体随状态即时变化；`curl -I` 核对 `cache-control: no-cache` 与 ETag，带 `If-None-Match` 命中 304、内容变更后 ETag 改变 · 草稿产品经 `/public/products/{slug}` 与 `/public/search` 均查不到 · 详情返回的分类名与后台录入逐字一致 · 搜索产品项带真实分类名 · 提交询价后下架该产品，线索接口仍按 `product_uid` 返回同一条内容的当前指向（`origin='draft'`，`state_text` 由 `PRODUCT_STATE_TEXT` + `productState` 判为「已下架」，非空指向）

## 5. 前端：类型定义与接口客户端按双表签名

- [x] 5.1 `buinessweb/src/types/cms.ts`：`ProductAdminRow`（[:157-174](../../../buinessweb/src/types/cms.ts)）改为并集行形状，新增 `uid`/`origin`/`state`/`state_text`/`updated_by`/`updated_by_name`/`published_at`，`specs` 收敛为 `{label,value}[]`（去掉 `any`）
- [x] 5.2 同文件新增 `ProductEditable`（含 `readonly`/`readonly_hint`）与 `ProductDraftPayload`（camelCase，与后端 `draftCreateSchema` 对齐，**没有 status 字段**）；复用 `ArticleOrigin`/`ArticleState` 的**类型形状**但各自命名（`ProductOrigin`/`ProductState`），不跨链 import 类型别名
- [x] 5.3 `ProductDetail`（[:71-78](../../../buinessweb/src/types/cms.ts) 区段）补分类名称字段的可选性说明（`category: string | null`），相关推荐项同样；确认没有前端侧兜底常量的余地
- [x] 5.4 `buinessweb/src/api/cms.ts`：`cmsAdmin.products` 重写为 `list/getOnline/getDraft/createDraft/updateDraft/deleteDraft/publish/unpublish/setOnlineSort/categoriesWithRefCount`，每个写方法签名都收 `uid`——落地形态按两张表各自的行 id 分命名空间：`cmsAdmin.products`（`list/getOnline/setOnlineSort/unpublish`，寻址 `products` 行 id）与 `cmsAdmin.productDrafts`（`get/create/update/remove/publish`，寻址 `product_drafts` 行 id），分类仍是 `cmsAdmin.productCategories.list`（返回行内含跨两表 `ref_count`），未再造 `categoriesWithRefCount` 这一个方法
- [x] 5.5 同文件补 `audit.byProductUid(uid, params)`（走既有 `GET /audit?entityType=product&entityUid=`），不移植资讯的 `view_count` 上报（产品没有浏览计数）
- [x] 5.6 全站 grep 移除对旧端点的调用残留（`cms.products.create/update/remove` 之类直连 `POST/PATCH/DELETE /products`），包括产品表单里提交 `status` 的代码路径
- [x] 5.7 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过（此步允许界面暂不匹配，客户端与类型层先闭合）
- [x] **验证**：`ProductEditable`/`ProductDraftPayload` 的字段与后端 `draftCreateSchema` 逐字段比对一致（名称、可选性、null 语义）· 类型层面无 `any` 残留（`specs`、`gallery`、`highlights` 三处）· 编译报错全部指向待改界面而非客户端

## 6. 前端：两个产品功能目录与路由指向

- [x] 6.1 `git mv` `buinessweb/src/views/admin/content/{products,product-edit,product-categories}.vue` → `views/admin/content/product/{index,edit,categories}.vue`（保留历史，不新建同名空文件）
- [x] 6.2 `git mv` `buinessweb/src/views/website/{Products,ProductDetail}.vue` → `views/website/products/{index,detail}.vue`
- [x] 6.3 从 `product-edit.vue`（279 行）拆出 `product/components/GalleryEditor.vue`（上限 8、可删、可上下调序、空位不提交空串）与 `SpecsEditor.vue`（上限 20、行序即展示序、`label` 必填校验、提交形态与后端一致）；编辑页只保留表单编排与提交
- [x] 6.4 新写 `product/components/DescriptionEditor.vue`（Tiptap 3，见 design D9）：复用已装的四个包，**不引入新依赖**；能力只放开 `h2/h3/h4` 标题 + 粗体/斜体/列表/链接/图片，图片只从 `MediaPicker` 选取（不给直传与外链输入）；工具栏图标只用 `@element-plus/icons-vue`（内网 iconfont 本地不可达）；现有文本域的字段位置与提交字段名不变，编辑器接管同一个 `description` 值
- [x] 6.5 三个私有子件 MUST NOT 被产品目录外的界面 import；`MediaPicker`、`SectionRenderer` 等共用件保持从原共用路径引用；产品目录与资讯目录之间零相互 import（grep `views/admin/content/article` 与 `views/website/news` 确认）
- [x] 6.6 `buinessweb/src/router/index.ts`：管理端三条（[:48-50](../../../buinessweb/src/router/index.ts)）与官网两条（[:18-19](../../../buinessweb/src/router/index.ts)）记录只改 import 指向；**path、name、`meta.title`、`meta.activeMenu` 一律不动**（界面迁移不改变使用方式，`/admin/content`、`/admin/content/products/edit/:id?`、`/products`、`/products/:slug` 地址不变）
- [x] 6.7 `router/index.ts` 新增 `product-detail` → `/product/:slug` → `views/website/products/detail.vue`，与 `/products/:slug` **两条并存、指向同一组件**（照资讯侧 [:21-23](../../../buinessweb/src/router/index.ts) 的过渡形态注释写法）；`/products/:slug` 的移除归 C1 第 3 组，本步不删
- [x] 6.8 核对 `stores/adminMenu.ts` 的首叶解析与 `meta.activeMenu` 高亮未被破坏：后台侧栏「产品管理 / 产品分类」进得去、编辑页高亮仍落在列表项
- [x] 6.9 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；侧栏产品相关入口逐条点击回归（地址与迁移前相同，收藏仍有效）
- [x] **验证**：走查 `content-view-structure` 三个场景——按功能定位界面（改产品详情展示不打开资讯目录任何文件）· 私有子件不外露（别处想复用规格控件拿不到）· 界面迁移不改变使用方式（新旧地址同为 200）· 新增场景：描述编辑器与资讯正文编辑器各自一份（改产品描述编辑能力，资讯正文编辑行为不变）

## 7. 管理端产品界面：列表、编辑页、分类维护

- [x] 7.1 `product/index.vue` 列：名称（含系列）、分类、价格文案、状态标签、排序值、修改人、修改时间、上架时间、创建时间；状态列读 `state_text`（前端不维护称谓映射）
- [x] 7.2 行内按钮**只由 `origin` 与 `state` 渲染**（同资讯 `index.vue:179-186` 的做法）：`online` → 查看 + 下架 + 调整排序；`draft` 且 `state=draft` → 编辑 + 发布 + 删除；`draft` 且 `state=offline` → 编辑 + 发布 + 删除；界面不出现指向 `DELETE /products/:id` 的按钮
- [x] 7.3 状态筛选项改为三态（草稿 / 已上架 / 已下架，值对齐后端判据）；关键词与分类筛选走 3.4 的并集参数
- [x] 7.4 分页补每页条数选择（`layout="total, sizes, prev, pager, next"`，`page-sizes=[12,24,48]`），与资讯列表同形
- [x] 7.5 移除 `products.vue:62-64` 的乐观翻转 `PATCH {status}`：所有动作成功后按服务端结果重新取数，不本地猜状态
- [x] 7.6 下架二次确认文案点名后果：「确认下架产品「{名称}」？下架后官网立即不可访问，内容保留在未上架区，需重新发布才恢复；该产品的官网地址 `/product/{slug}` 立即失效。」（与资讯的下架确认同形，多一句地址失效）
- [x] 7.7 「调整排序」用行内小对话框提交 `{uid, sort}`，成功后只刷新该行数据并提示；不改内容列、不改上架时间
- [x] 7.8 删除确认区分文案：「确认删除草稿「{名称}」？删除后不可恢复。」/「确认删除已下架内容「{名称}」？删除后不可恢复。」
- [x] 7.9 `product/edit.vue` 三态：新建（无 id）/ 编辑未上线行（`?draft=<draftId>`）/ 只读查看线上行（`/:id`），取数按 design D3 的 id 规则单点判定（照资讯 `edit.vue:56-60` 的 `routeIds()` 写法）；`readOnly = !canWrite || 是线上行`，线上行不给保存出口；头部常驻「最后由 {修改人} 于 {时间} 修改」与当前官网地址（在线行显示生效地址，草稿/已下架显示待生效地址）——「有未保存的编辑」标记与 Tiptap 的冲突已处理：编辑器挂载会把存量 HTML 规范化重写一遍（`<li>` 补 `<p>`、属性换序），那不是运营的编辑，故落过第一次真实交互（表单卡片上的 mousedown/keydown）之前的编辑器回写一律并入快照，之后每次改动照常进脏标记
- [x] 7.10 保存 = `updateDraft` 后把地址栏落成 `?draft=<id>`（照资讯的 `router.replace`）；「保存并发布」= 保存成功后 `publish` 并 `router.replace` 到线上行查看态；新建 = 先 `createDraft` 拿 id 再进入编辑态，刷新页面不产生第二条草稿
- [x] 7.11 标识字段就地校验：格式不符实时提示；提交冲突显示服务端「撞线上/撞草稿」文案；**修改标识时弹后果确认**（说明重新发布后新地址生效、旧地址失效，且已下架期间本就不可访问）——资讯链没有这条弹窗，本链按 spec 要求补上——提示节点自己画在输入框下方：本项目的 `el-form-item` 只把 `message` 交给校验器、不渲染成可见文字（实测 `.el-form-item__error` 为空节点），本地格式提示与服务端 409 文案共用同一个位置、冲突文案优先
- [x] 7.12 表单不再渲染状态 `el-switch`（移除 `product-edit.vue:182`）；`sort` 输入框在未上线表单保留（`:177`），线上查看态全部只读
- [x] 7.13 描述编辑器接入：保存前不本地清洗（以服务端返回为准），响应里 `stripped_foreign_images` 数量大于 0 时就地提示「已移除 N 张站外图片，请从素材库重新选取」；描述留空时不阻止发布——服务端实际回传的字段名是 `stripped_images`（与资讯侧同名，见 `PATCH/POST` 响应），前端按它提示；`description` 走 Tiptap 编辑，字段名与位置不变
- [x] 7.14 「修改记录」按钮打开审计时间线对话框（照资讯 `edit.vue:303,405-424`），调 `audit.byProductUid(uid)`，展示 `action` + `diff.fields` + 操作人 + 时间；首次进入时显示「修改记录自本次修订起」说明
- [x] 7.15 `product/categories.vue` 显示 `ref_count`（跨两表），删除被拒时原样显示服务端占用数量文案，不自行改写
- [x] 7.16 权限：仅 `content:read` 的账号在产品界面看不到任何写入口（按钮用 `auth.hasPerm('content:write')` 判定），直接调接口仍由服务端拒绝
- [x] 7.17 返回入口统一（回列表 `/admin/content/products`），页面标题与按钮文案三态一致
- [x] 7.18 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过
- [x] **验证**（浏览器实测，dev 服务已在跑）：走查 `product-content-flow` 的录入、双表放置、线上只读、修改留痕、三态命名、标识可变、形态一致、描述清洗八项要求的全部场景，含失败与权限被拒路径；重点验证「已上架行无编辑/删除入口」「只调排序后内容未变」「下架后编辑再发布，上架时间与排序延续、修改记录串到同一 `uid`」

## 8. 官网产品中心：列表与详情以内容自身渲染

- [x] 8.1 `products/index.vue` 保持装修页区块驱动结构不变，列表区取数逻辑留在 `products/` 目录内（不从资讯目录 import 任何东西）
- [x] 8.2 `SecProductGrid.vue` 与 `SecFeatureProducts.vue` 的详情地址改为代码生成 `/product/{slug}`（[:33,:38](../../../buinessweb/src/views/website/ProductDetail.vue) 同类写法核对），`Search.vue` 的产品结果项同步；移除 `|| '存储产品'` 兜底
- [ ] 8.3 列表区三层状态：装修页未发布 → 整页品牌化 404；已发布但 0 条 → 页面正常 + 列表区空态与返回入口；请求失败 → 可重试错误态（三种表现可区分，不合并）——「请求失败可重试错误态」已实现（SecProductGrid 加 `failed` 分支）；「装修页未发布→整页 404」暂未做：`usePageBlocks` 是官网全局共用件，按约定「接口失败保底不白屏」保留兜底默认块，为单一页面改成整页 404 会特化共用件，留待 C2 页面发布态统一处理
- [x] 8.4 筛选与分页参数落地址栏（分类、关键词、页码），同一地址得同一结果；页码越界返回空列表且总数正确
- [x] 8.5 `products/detail.vue` 移除写死的「产品详情 / 参数与卖点」区头（[:79-81](../../../buinessweb/src/views/website/ProductDetail.vue)），改为产品名称、系列与真实分类名（读 4.1/4.2 下发字段，`null` 时整块标识不渲染）
- [x] 8.6 移除占位图回落 `cube-closeup.png`（[:18](../../../buinessweb/src/views/website/ProductDetail.vue)、[:181](../../../buinessweb/src/views/website/ProductDetail.vue)）：无图集只显示封面，无封面用无图占位样式（CSS 空态，不是某个真实产品图）
- [x] 8.7 描述按服务端清洗后的 HTML 渲染（`v-html` 于已清洗内容），保留小标题/列表/图片排版；描述为空时该区不渲染
- [x] 8.8 规格、卖点、图集、相关产品、购买入口五处「无数据即不渲染」；外链统一 `rel="noopener noreferrer"`
- [x] 8.9 详情的查无此条（品牌化 404，不泄漏任何该产品字段）与取数失败（可重试错误态）分离——拆开 `:12/:45/:52` 现在合并的 `notFound`
- [x] 8.10 浏览器标题使用产品名称（`document.title` 走既有 afterEach 规则时带上名称）
- [x] 8.11 已下架与草稿产品的 `/product/{slug}` 直访必须 404；同一地址在发布前后表现随状态即时变化（配合 4.4 的协商缓存，无 60 秒延迟）
- [x] 8.12 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过
- [x] **验证**（浏览器实测）：种子四条产品逐个走过——① 字段完整（分类名与后台录入逐字一致、规格 3 项按录入序、富文本描述排版正确）② 仅封面（图集/规格/卖点/描述四块都不渲染、无占位假图、无「存储产品」）③ 草稿（官网列表与搜索都查不到）④ 已下架（旧地址 404）；走查列表、详情、下发、下架不可见四项要求的全部场景

## 9. 修订既有 change、项目约定与交付文档

> 结构性教训：上一轮文档失同步，成因是「任务只写『更新文档』而不点名文件」。本组逐文件点名，一个文件一项。

- [x] 9.1 `openspec/config.yaml`：把「保存与发布是两个动作：已发布内容的编辑先落成未发布改动」改写为「一条内容同一时刻只存在于一张表；已上线内容只读，编辑与删除只作用于未上线表；发布与下架都是事务内整行搬运」，并补一句线上唯一可写列是排序值（产品侧）——**不改这条项目级约定，两条链的实现都与约定相抵触**
- [x] 9.2 `openspec/changes/article-content-flow/design.md`：订正两处陈述——依赖关系段的「产品链不做草稿分离，本 change 的双表只动资讯」、D12/修订清单的「产品侧仍不做草稿分离（该链 Non-Goals 不变）」，改为「产品链已按同构双表落地，两链各自持有表与状态文案常量」；并更新它对 `010_product_flow.sql` 的范围描述（现为双表 + 形态归一 + `uid`/`updated_by`/`published_at` + `inquiries.product_uid` + 四形态种子）
- [x] 9.3 在 `openspec/changes/article-content-flow/design.md` 的修订清单里登记一条不对称：其 spec 写「标识格式要求与产品一致」而 `draftCreateSchema.slug`（[content.ts:293-294](../../../backend/src/routes/content.ts)）只有 min/max、无格式校验；本链已按自己的 spec 实现格式校验，**资讯侧的补齐留给资讯链，本链不代改其行为**
- [x] 9.4 `docs/数据结构文档.md`：新增 `product_drafts` 表定义、`products` 的三个新列与 `CHECK (status = 1)`、`inquiries.product_uid`，以及「产品三态判据 = 在哪张表 + `state`」的说明
- [x] 9.5 `docs/接口文档.md`：产品管理端六个端点（草稿 CRUD、发布、下架、排序）的请求/响应/错误码、`uid` 必带约定、三态文案来源、分类 `ref_count`；公开接口的分类名称字段与 `no-cache` + ETag 缓存口径
- [x] 9.6 `docs/后端执行文档.md`：010 的执行顺序与前置依赖（迁移必须先于端点上线）、反向脚本适用条件（回退迁移必须与后端回退同批）、事务边界与 23505→409 的转换点
- [x] 9.7 `docs/前端执行文档.md`：两个产品目录的文件树与私有子件清单、路由记录的新旧并存说明（`/product/:slug` 新增、`/products/:slug` 待 C1 移除）、列表按钮形态由 `origin`+`state` 渲染的规则
- [x] 9.8 `docs/service-design/01-frontend-buinessweb-design.md`：补「产品链双表流转」一节（草稿 → 上架 → 下架 → 编辑 → 再上架的时序图 + 线上只读与排序例外的边界）
- [x] 9.9 核对 C1 `site-runtime-link-integrity` 已按两条独立路由修订到位：`design.md` D2 与地址表、`specs/page-routing/spec.md` 的地址集合、`tasks.md` 第 3 组（3.1/3.2/3.3/3.7/3.8）与第 4 组（4.1/4.4/4.5）的改写目标均为 `/product/:slug`（本链只新增记录，不代 C1 删除 `/products/:slug`）——**核对通过**：C1 `design.md` 路由统计表第 16 行、`specs/page-routing/spec.md` 白名单（第 9、77、111 行）、`tasks.md` 3.1/3.2/3.3/3.7/3.8 与 4.1/4.4/4.5 的改写目标均已写成 `/product/:slug`；C1 第 3 组仍未执行（旧记录在），故本链 router 里 `product-detail-legacy` 与 `product-detail` 两条并存是预期状态，站内跳转已全部只生成 `/product/${slug}`（实测 `SecFeatureProducts.vue:33`、`SecProductGrid.vue:105`、`Search.vue:45`、`products/detail.vue:87`、`admin/.../product/{edit,index}.vue`，无一处残留 `/products/${slug}`）
- [x] 9.10 核对 C2 `page-publication-approval` 不受本链影响：C2 只管 `pages` 表，`/product/:slug` 的取数仍读 `products` 正式列；与 `decoration-editor-toolkit` 无区块属性冲突 —— **核对通过**：C2 五个文件 `grep -rn "product|article|/api/public"` 零命中，其 spec 只约束 `pages.content_json`/`draft_json` 的发布与版本；本链未改 `pages` 的任何读写路径（`/public/pages/:slug` 与 `/public/products/:slug` 是两条独立端点），也没有新增或改动任何区块类型与 props（`website/blocks.ts` 的改动是区块结构版本化，属《官网低代码装修》那一份），产品详情页不消费 `content_json`
- [x] 9.11 回写本 change 的 `proposal.md` / `design.md` / `specs/*/spec.md` / `README.md` 与实现保持一致（若实现过程中端点名或列名有调整，以代码为准修订文档，不允许「文档说一套、代码做一套」）——**已按代码逐处校准**：① `proposal.md`/`design.md` 的旧行号引用统一加「改造前位置」免责并改指现行实现（产品段 [content.ts:699-1224](../../../backend/src/routes/content.ts)、`PRODUCT_STATE_TEXT` [:97](../../../backend/src/routes/content.ts)、`PRODUCT_ONLINE_WRITABLE_COLUMNS` [:779](../../../backend/src/routes/content.ts)、`GET /products` [:1137](../../../backend/src/routes/content.ts)）；② 补上实现里后加的第七条写入路径口径（审计 `diff.fields` 只收值真的变了的列，见 D7.5），并在 spec 里加对应场景；③ 文案以代码字面量为准三处：分类删除 409 是「已上架 X 个、未上架 Y 个」（[:759](../../../backend/src/routes/content.ts)）而非「线上 X 条、未上线 Y 条」，线索的 `state_text` 是「已下架」而非规约术语「未上线」（[:82](../../../backend/src/routes/forms.ts)），4.8/10.9/D12 已按此收窄并写明界面未渲染该列；④ `README.md` 的计数与实现核对：场景 66→**67**（新增一条留痕场景）、BREAKING **6** 项（排序例外与线索追溯在 proposal 里不是 BREAKING 行）、风险 **16** 条（原写 17）、D8 由「六步」改「一个脚本做完七件事」；⑤ 顺带订正 `docs/接口文档.md` 附录 D 的 `products(0/1)` 旧枚举与 §4.4/§5.5 的两处文案
- [x] 9.12 若 `openspec` CLI 可用则跑 `openspec validate --all --strict` 并在 README 记录结果；**本机当前 `command -v openspec` 为空**，则改为逐文件走查 Requirement 均用 SHALL/MUST 表述可观察行为、每个 Requirement 至少一个 Scenario 且覆盖失败与权限被拒路径，并在 README 注明校验未由 CLI 执行 —— **走查通过**：两份 delta 共 16 个 Requirement，逐个都含 SHALL 或 MUST 且每个至少 2 个 Scenario（`product-content-flow` 14 项 / 67 场景，`content-view-structure` 2 项 / 7 场景）；失败路径覆盖标识重复、标识格式非法、行 id 与 uid 不符、并发发布、并发争抢标识、畸形形态、越界页码、取数失败、查无此条、粘贴站外图片被剥；权限被拒路径有三处独立场景（无写入权限不可录入、无发布权限不能改动线上、无写入权限不能删分类）。README「校验状态」一节已写明 CLI 未执行与替代走查方式
- [x] **验证**：`git diff` 里 `docs/` 五份文档 + `docs/service-design/01-*` + `openspec/config.yaml` + `article-content-flow/design.md` 均有改动；九份产品链文档中不再出现「产品不做草稿分离」「编辑上架中的产品即时生效」「`status` 0/1 表达上下架」三处旧口径 —— **通过**：`git status --porcelain -- docs openspec` 逐一有改动（`docs/前端执行文档.md`、`docs/后端执行文档.md`、`docs/接口文档.md`、`docs/数据结构文档.md`、`docs/数据库执行文档.md`（§8 迁移与演进按现状重写：`schema.sql` 为合并基线、`migrations/NNN_*.sql` + 同名 `.rollback.sql` 手工 psql 执行、迁移工具仍未引入）、`docs/service-design/01-frontend-buinessweb-design.md`、`openspec/config.yaml`、`openspec/changes/article-content-flow/design.md`）；三句旧口径 `grep -rn` 在本链文档与 `docs/` 下**不再作为现行口径出现**——仅剩 5 处全部处于「撤销 / 否决」语境（[README.md:5](README.md)、[design.md:19](design.md) 的口径变更声明、[design.md:112](design.md) 的 D3 否决清单、[proposal.md:5](proposal.md) 与上面这行验证本身），没有任何一处把它们当现状陈述；`openspec/config.yaml` 与 `article-content-flow/` 零命中，唯一把旧模型当作事实描述的地方在 `openspec/changes/archive/2026-10-28-product-article-content-flow/`（已归档的上一版，按归档不改）。仍把 `PATCH /products/:id` 当历史断点提及的四处都在「已移除」语境里，且已带「改造前位置」说明

## 10. 端到端验证与回滚演练

- [x] 10.1 主链路走查：后台新建（规格 3 项 / 卖点 2 条 / 图集 2 张 / 富文本描述）→ 保存 → 重开仍是我的内容且官网无变化 → 发布 → 官网列表可见 → 详情字段逐项一致（分类名不出现「存储产品」）→ 下架 → 列表与搜索消失、旧地址 404 → 编辑（含改标识）→ 再发布 → 上架时间与排序延续、新地址正确
- [x] 10.2 线上只读验证：**对已上架行尝试保存与删除**（界面入口 + 直接调接口两条路都要试）一律被拒；只调 `sort` 生效且内容列逐字段未变；绕过界面直接 `PATCH` 线上行不存在（端点已移除）
- [x] 10.3 身份与留痕验证：`uid` 与行 id 不符的写请求被拒；审计时间线用同一 `uid` 串起「建 → 改 → 发布 → 排序 → 下架 → 改 → 再发布」，每步可见操作人与 `diff.fields`
- [x] 10.4 标识验证：改一次产品标识，旧地址 404、新地址正确；两个会话并发争抢同一标识只有一个成功；含大写/中文/前后连字符的标识在写入前被拒
- [x] 10.5 形态验证：`specs` 传对象形态、21 项规格、9 张图集、缺参数名的规格，四种情况全部写入前被拒且库里保持原值；1.2 报告的超上限存量行已交运营确认
- [x] 10.6 描述清洗验证：粘贴带 `style`/外链图片/表格的内容，保存后 `style` 与表格被剥、站外图片数量回传并提示、官网渲染与服务端存的一致；描述留空可发布且官网不渲染该区——实测 `style` 与外链图片被剥（`stripped_images` 回传正确）；**表格节点保留**：`sanitize` 白名单（lib.ts SANITIZE_OPTS）沿用 `sanitize-html` 默认，`table/tr/td` 未被剥除，与资讯链共用同一份清洗，非本链引入；产品编辑器前端无表格入口（StarterKit 未开表格），仅粘贴可能带入。如需剥表格需改共用 `sanitize` 白名单（会波及资讯正文），留作独立决策，不在本链擅自收紧
- [x] 10.7 缓存即时性验证：上架与下架后立刻请求官网列表与详情，响应随状态变化；`cache-control: no-cache` + ETag 命中 304 仅在内容未变时出现
- [x] 10.8 分类删除保护验证：删「只有草稿在用」的分类同样被拒（跨两表统计生效）；删空分类成功且官网筛选同步
- [x] 10.9 线索追溯验证：提交带产品的询价 → 下架该产品 → 线索接口按 `product_uid` 回产品名/标识与三态称谓（下架期间为「已下架」，原写的「未上线」是把规约术语当成了界面文案）→ 再发布后仍指到同一条内容。界面呈现不在本链：`admin/leads/index.vue` 未渲染 `product` 列，见 4.8 的收窄说明
- [x] 10.10 三态命名验证：列表、筛选、行内提示、编辑页头部、下架确认、审计文案六处的状态称谓全部一致且来自服务端（前端无自维护称谓映射）——**「一致」成立，「全部来自服务端」需按实现收窄**：列表状态列与编辑页头部标签读服务端 `state_text`，称谓单点是 `PRODUCT_STATE_TEXT`；另有两处中文由前端持有——筛选下拉的三个选项标签（[product/index.vue:178-180](../../../buinessweb/src/views/admin/content/product/index.vue)）与审计时间线的状态枚举转译 `STATE_TEXT`（[product/edit.vue:308-310](../../../buinessweb/src/views/admin/content/product/edit.vue)）。三处字面量当前逐字相同，改称谓须同步；本链不为此新增下发端点
- [x] 10.11 权限路径验证：未登录直访 `/admin/content/products`、`/admin/content/products/edit/1` 跳登录并保留 `redirect`；仅 `content:read` 账号无写入口且保存/发布/下架/排序/删分类五类请求均被服务端拒绝
- [x] 10.12 隔离性验证：资讯链的行为与界面在本链改动后逐项回归（资讯列表/编辑/发布/下架/详情/搜索），两目录零相互 import；`router/index.ts` 与 `public.ts` 的改动未改写资讯分支
- [x] 10.13 两端类型检查：backend `npx tsc --noEmit`，buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`
- [x] 10.14 回滚演练：执行 `010_product_flow.rollback.sql` 后官网与后台退回单表可用形态，再前向执行一次恢复四形态种子；确认「只回退迁移而保留后端」会硬失败（文档 9.6 已写明必须同批）——实测（先 `pg_dump` 备份 `products`/`product_drafts`/`product_categories` 三表数据）：反向脚本跑完后公开接口仍可用（`/public/products` 与 `/public/product-categories` 返回 200 空列表，只读 `products` 且不引用新列），保留新后端时管理端一律硬失败（`GET /products` → 500 `column p.uid does not exist`，`GET /products/drafts/:id`、`GET /product-categories` → 500 `relation "product_drafts" does not exist`），与 9.6 的「回退迁移必须与后端回退同批」一致；再前向执行一次，`products` 2 行 + `product_drafts` 2 行（state 各 0/2）+ 2 个种子分类、`CHECK` 收窄、`inquiries.product_uid` 与索引回来，末尾一致性计数全为 0，管理端与官网接口恢复正常
- [ ] 10.15 提交切分：目录重组 / 数据迁移 / 后端写入契约 / 后端下发契约 / 管理端 / 官网 / 文档回写 各自独立提交，确认可单独 `git revert` 而不影响资讯链（提交动作需需求方明确指示后再执行）
