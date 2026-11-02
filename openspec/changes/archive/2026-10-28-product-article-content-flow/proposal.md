## Why

产品与资讯是官网唯二的两条内容业务链，但今天两头都是断的：

- **管理端能录，录了不确定能用。** 编辑表单里改「标识」会被服务端静默丢弃（`PATCH /products/:id`、`PATCH /articles/:id` 的字段映射表都不含 `slug`）；产品的规格参数列在库里默认 `'{}'::jsonb`，而官网详情按 `[{label,value}]` 数组渲染，形态靠前端 `normalizeSpecs` 临时兜；删除分类时 `category_id` 是 `ON DELETE SET NULL`，已发布内容的分类归属被静默清空。
- **官网能显示，显示的不是内容本身。** `ProductDetail.vue` 与 `Article.vue` 的头图区写死「产品详情 / 参数与卖点」「新闻咨询 / 详情」文案，产品图缺位时用内置占位图 `cube-closeup.png` 冒充真实产品，取数失败与「查无此条」合并成同一个 `notFound`，面包屑里还带着「新闻咨询」这个错别字。
- **两个功能共用 `products` / `articles` 两张表、两套接口，代码却平铺在 `views/admin/content/*.vue` 与 `views/website/*.vue` 里**，产品与资讯的实现相互抄近路（分页控件、状态文案、返回路径都不一致），加第三类内容时只能再复制一遍散落的文件。
- **资讯正文要手写 HTML，而且改一句就上线一句。** 编辑页的正文是源码文本域（`article-edit.vue` 注释自陈「不引入富文本依赖」），运营要手敲标签；而 `articles` 只有一份 `body`，`PATCH` 直接覆盖（[content.ts:266](../../../backend/src/routes/content.ts)），改一篇已发布资讯改到一半、官网立刻显示半成品。服务端清洗又全剥 `style`、`class` 只在 `img` 上保留（[lib.ts:54-63](../../../backend/src/lib.ts)），所以富文本必须按这份白名单裁剪能力，否则「编辑器里好看、存进去失真」。

本 change 把两条链一次打通到可验收：管理端录入 → 状态生效 → 官网列表 → 官网详情，资讯正文改为富文本撰写并把「保存」与「发布」分离，实现落成**四个独立功能目录**。

## What Changes

- 新增能力 **`product-content-flow`**：产品从管理端录入到官网产品中心列表与产品详情展示的完整行为契约（字段完整性、标识可改且唯一、图集/规格/卖点形态统一、上架状态即时影响官网、三态可区分）
- 新增能力 **`article-content-flow`**：资讯从管理端录入到官网新闻资讯列表与资讯详情展示的行为契约（草稿/已发布/已下线三态与全站统一命名、富文本正文的可用格式边界与清洗、未发布改动与线上内容分离、发布时间只写一次、浏览计数、分类引用保护）
- 资讯正文改为**所见即所得富文本**撰写：采用 Tiptap 3（`@tiptap/vue-3` + `@tiptap/starter-kit` + `@tiptap/extension-image` + `@tiptap/extension-placeholder`），工具栏用 Element Plus 按钮与 `@element-plus/icons-vue` 图标自绘，插图走共用素材选择器；可用格式按后端清洗白名单逐条裁剪，**不提供**对齐/字号/颜色/缩进/表格等在保存后会被剥掉的格式（详见 `design.md` D10）
- **BREAKING** 资讯的「保存」与「发布」拆成两个动作：对已发布资讯的编辑内容落成未发布改动，官网正文在该期间保持上次发布的内容；发布在同一个事务内覆盖线上并清除改动（详见 `design.md` D11）——现有「保存即生效」的调用语义随之改变
- 新增能力 **`content-view-structure`**：两个内容功能在 `views` 下落成四个独立目录（管理端产品、管理端资讯、官网产品中心、官网新闻资讯），目录各自内聚，产品与资讯的业务实现之间不互相引用
- **BREAKING** 产品的 `specs` 字段形态定为「`{label,value}` 有序数组」，服务端读写与库默认值统一（现状列默认 `{}`，前端各自兜形）；存量 `{}` 值由迁移归一为 `[]`
- **BREAKING** 编辑态允许修改标识（slug），服务端做唯一性校验；官网详情地址随标识变化，旧标识立即不可访问（沿用 `site-runtime-link-integrity` 已定的严格 404 规则）
- 删除分类时若仍有产品或资讯引用，服务端拒绝并返回占用数量（现状是静默 `SET NULL`）
- 官网详情按 C1 的统一路由 `/option/:type/:slug` 落地，但**实现拆到两个功能目录各自内部**（`products/detail.vue`、`news/detail.vue`），撤销 C1 原计划「合并成单个 `Option.vue`」的做法
- 移除详情与列表中的内置占位假数据（占位产品图、写死的区头文案），无图即不渲染该区块，无内容即空态
- 补齐验收数据：迁移种入 2 个产品分类、2 个资讯分类、3 个产品、3 条资讯（当前两表均为 0 行，两条链无法端到端验证）

## Capabilities

### New Capabilities

- `product-content-flow`: 产品录入与状态维护、官网产品中心列表与详情
- `article-content-flow`: 资讯录入与发布流程、官网新闻资讯列表与详情
- `content-view-structure`: 四个功能目录的归属、内聚与扩展规则

### Modified Capabilities

（无——`page-routing` 与 `site-navigation` 由 `site-runtime-link-integrity` 建立且尚未实现；本 change 只调整它对「详情实现如何组织」的决策，见 `design.md` D1）

## Impact

- 前端目录重组（`git mv` 级别）：
  - `buinessweb/src/views/admin/content/{products,product-edit,product-categories}.vue` → `buinessweb/src/views/admin/content/product/{index,edit,categories}.vue`
  - `buinessweb/src/views/admin/content/{articles,article-edit,article-categories}.vue` → `buinessweb/src/views/admin/content/article/{index,edit,categories}.vue`
  - `buinessweb/src/views/website/{Products,ProductDetail}.vue` → `buinessweb/src/views/website/products/{index,detail}.vue`
  - `buinessweb/src/views/website/{News,Article}.vue` → `buinessweb/src/views/website/news/{index,detail}.vue`
- 前端路由：`buinessweb/src/router/index.ts`（管理端 `content/*` 与 `content/products/edit/:id?` 等 path 不变，仅 import 路径改变；官网详情按 `/option/:type/:slug` 分别指向两个目录的 `detail.vue`）
- 官网列表：`buinessweb/src/website/sections/{SecProductGrid,SecNewsFeed,SecFeatureProducts,SecLatestNews}.vue` 的跳转地址与空态；`buinessweb/src/views/website/Search.vue` 的结果跳转
- 前端新增依赖（对「不轻易新增 npm 依赖」的有意例外，已在 `openspec/config.yaml` 登记）：`@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder`（实测 3.32.0，传递依赖 `@tiptap/core`、`@tiptap/pm` 等）
- 新增文件：`buinessweb/src/views/admin/content/article/components/RichBodyEditor.vue`（正文编辑器，只挂在资讯编辑页内，产品目录与其他后台界面不引用）
- 后端：`backend/src/routes/content.ts`（products/articles 的 PATCH 字段映射补 `slug` + 唯一性校验、specs 形态校验与归一、分类删除引用保护、`GET /products/:id` 与 `GET /articles/:id` 返回完整字段；`PATCH /articles/:id` 按状态分岔写正式列或 `draft_json`、`publish` 改事务覆盖、新增放弃改动端点）、`backend/src/routes/public.ts`（`/public/products/:slug`、`/public/articles/:slug` 的三态区分与浏览计数；公开侧只读正式列）
- **`backend/src/lib.ts` 的清洗白名单不改动**：富文本能力按它裁剪，不放宽 `style`/`class`（放宽等于为编辑器重写安全边界）
- 类型与接口：`buinessweb/src/types/cms.ts`（`ArticleCategory` 补 `sort`、`specs` 由 `any` 收敛为 `{label,value}[]`、资讯行补「是否存在未发布改动」）、`buinessweb/src/api/cms.ts`（产品补发布/下线动作，与资讯对齐；`articles.update` 注释点名已发布内容只写草稿）
- 数据：新增迁移 `backend/sql/migrations/010_content_flow.sql`（specs 归一 + 列默认改 `'[]'` + `articles.draft_json` 新列 + 分类与内容种子），附反向脚本；同步 `backend/sql/schema.sql`
- 不改动：装修区块模型与 `sectionRegistry` 的 props 结构、素材库上传链路、`site-runtime-link-integrity` 已定的路由白名单与导航规则、`page-publication-approval` 的 `pages` 表流程
