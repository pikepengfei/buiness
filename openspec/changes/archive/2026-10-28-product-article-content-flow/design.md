## Context

两条内容链的现状（本轮逐一读过代码与库）：

**后端接口基本齐备，契约有洞。** `products`/`articles` 各自有管理端 CRUD + 分类 CRUD，公开侧有 `/public/products`、`/public/products/:slug`、`/public/articles`、`/public/articles/:slug`、`/public/search`（[public.ts:74-136](../../../backend/src/routes/public.ts)、[public.ts:163-174](../../../backend/src/routes/public.ts)）。洞在四处：

- `PATCH /products/:id` 与 `PATCH /articles/:id` 的字段映射表都不含 `slug`（[content.ts:361-363](../../../backend/src/routes/content.ts)、[content.ts:262-266](../../../backend/src/routes/content.ts)）——编辑表单里改了标识，请求发出、返回成功、库里不变
- `products.specs` 列默认 `'{}'::jsonb`（[schema.sql:206](../../../backend/sql/schema.sql)），详情按 `[{label,value}]` 数组渲染（[ProductDetail.vue:140-148](../../../buinessweb/src/views/website/ProductDetail.vue)），管理端编辑的也是数组，靠 `normalizeSpecs` 在读取时兜形
- 详情浏览量在 `GET /public/articles/:slug` 里直接 `UPDATE ... +1`（[public.ts:126](../../../backend/src/routes/public.ts)），而 `/public/*` 默认带 `max-age` 缓存（[public.ts:23-29](../../../backend/src/routes/public.ts)）——同一个缓存副本被多人命中时计数丢失，刷新即虚增
- 分类删除是裸 `DELETE`（[content.ts:216-219](../../../backend/src/routes/content.ts)、[content.ts:314-317](../../../backend/src/routes/content.ts)），`articles.category_id` / `products.category_id` 是 `ON DELETE SET NULL`，删分类会静默改变已有内容的归属

**前端实现可用但不对称。** 管理端六个视图都是 `<script setup>` 单文件、无超过 300 行的：产品列表用 `PATCH {status}` 做上下架（没有专用端点），资讯列表用 `publish`/`unpublish`；资讯列表的分页缺每页条数选择；`article-edit` 把状态 2 叫「已下架」而列表与后端叫「已下线」；产品与资讯编辑页的返回路径一个跳 `/admin/content`、一个跳 `/admin/content/articles`。

**官网详情写死了内容。** `ProductDetail.vue` 头图区标题固定为「产品详情 / 参数与卖点」，图集缺失时回落到内置 `cube-closeup.png` 冒充产品图；`Article.vue` 面包屑写「新闻咨询」（`pages.title` 同样是这个错别字），两者都把「请求失败」并入 `notFound`。

**正文是 HTML 源码文本域，且编辑即改线上。** `article-edit.vue` 顶部注释即「正文用 HTML 源码编辑，右侧可切换渲染预览（不引入富文本依赖）」（[article-edit.vue:5](../../../buinessweb/src/views/admin/content/article-edit.vue)），运营要手写标签。服务端清洗在**写入前**执行（[content.ts:249](../../../backend/src/routes/content.ts)、[content.ts:266](../../../backend/src/routes/content.ts)），白名单实测（[lib.ts:54-63](../../../backend/src/lib.ts)）：`sanitize-html` 默认标签集含 `h1`–`h6`、`p`、`ul/ol/li`、`blockquote`、`pre`、`code`、`hr`、`a`、`b/i/u/s/em/strong/mark`、`table` 系，项目另外补 `img`、`figure`、`figcaption`、`picture`、`source`；属性只放行 `a[href,name,target,rel]`、`img[src,srcset,alt,title,width,height,loading,class]`、`source[srcset,type]`——**`style` 一律剥除，`class` 仅在 `img` 上保留**。这条决定了富文本的能力边界。同时 `articles` 只有一份 `body`，`PATCH` 直接覆盖（[content.ts:266](../../../backend/src/routes/content.ts)），改一篇已发布资讯的半成品会实时出现在官网。

**验收数据为零。** 库里 `products`、`articles` 均 0 行，`banners` 0 行，`pages` 5 行——两条链无法端到端验证，`site-runtime-link-integrity` 任务 3.9 的「产品与资讯各取 3 条比对」当前无法执行。

**依赖关系。** 本 change 依赖 `site-runtime-link-integrity` 的固定白名单与严格 404（详情地址 `/option/:type/:slug` 由它定义）；与 `page-publication-approval`（只管 `pages` 表）和 `decoration-editor-toolkit`（只管装修区块的表单）无文件冲突——后者的「编辑器」指区块属性表单，与本 change 的资讯正文富文本是两回事，不共用实现。

## Goals / Non-Goals

**Goals:**

- 产品与资讯各打通「录入 → 状态生效 → 官网列表 → 官网详情」，缺项与失败可区分
- 前端落成四个独立功能目录，产品与资讯互不引用
- 资讯正文改为所见即所得富文本撰写，可用格式与后端清洗白名单严格对齐；「保存」与「发布」分离，编辑已发布内容不再即时影响官网
- 修掉四处真实契约缺陷：标识静默丢弃、规格形态漂移、浏览计数失真、删分类静默改归属
- 补上可验收的种子数据

**Non-Goals:**

- 不做产品分类的层级管理界面（后端 `parent_id` 已支持，UI 缺入口——另案）
- 不做正文的版本历史、多人协同编辑与 Word 保真粘贴（富文本只到「能力边界内的格式不失真」）
- 不做产品的草稿分离（产品以「下架」为天然的保护态，另见 Open Questions）
- 不做素材选择器的分类/关键词浏览与 objectKey 回传（沿用现状：只回传地址字符串）
- 不做产品/资讯的批量操作、定时发布、多语言版本
- 不改 `pages` 表与装修区块结构；详情页不作为装修页，不写进 `pages`

## Decisions

### D1 保留统一详情路由，实现拆到两个功能目录（撤销 `site-runtime-link-integrity` 的「合并成单一 Option.vue」）

路由仍是一条 `/option/:type/:slug`（上一轮已确认「统一详情页 + 路径段区分类型」），但路由记录按 `type` 分别指向两个目录：`product` → `views/website/products/detail.vue`，`article` → `views/website/news/detail.vue`。两分支各自维护字段与样式，共用的只有接口客户端、类型与装修渲染器。

被否决的替代方案：

- **单一 `Option.vue` 内做 `v-if` 双套渲染**（C1 原 D2）——产品与资讯的字段区、样式、相关推荐卡片会长年在同一文件里交织，与本轮「四个独立目录、互不引用」的要求直接冲突；且两个详情页的样式差异不小（420px 头图栅格 vs 860px 单栏正文），合并只会得到一个巨型 SFC
- **恢复两条独立详情路由** `/products/:slug`、`/news/:slug`——推翻已确认的统一地址规则，且会把「运营能配出死链」的老问题留在地址层

相应地，C1 的 `design.md` D2 与 `tasks.md` 第 3 组需改写（见「对既有 change 的修订」）。

### D2 四个目录的布局与文件命名

| 目录 | 文件 | 由何而来 |
|---|---|---|
| `views/admin/content/product/` | `index.vue` `edit.vue` `categories.vue` `components/GalleryEditor.vue` `components/SpecsEditor.vue` | `views/admin/content/{products,product-edit,product-categories}.vue`，编辑器内的图集/规格小控件从 279 行的 `product-edit.vue` 中拆出 |
| `views/admin/content/article/` | `index.vue` `edit.vue` `categories.vue` `components/RichBodyEditor.vue` | `views/admin/content/{articles,article-edit,article-categories}.vue`；正文编辑器从编辑页新拆出，只挂在资讯编辑页内（见 D10） |
| `views/website/products/` | `index.vue` `detail.vue` `components/` | `views/website/{Products,ProductDetail}.vue` |
| `views/website/news/` | `index.vue` `detail.vue` `components/` | `views/website/{News,Article}.vue` |

`git mv` 保留历史，`router/index.ts` 只改 import 路径不改 `path`/`name`；管理端「首叶解析为 `/admin/content`」的特殊规则（`stores/adminMenu.ts:8-10`）与 `meta.activeMenu` 高亮必须原样保住。样式继续写在各自 SFC 的 scoped style，不动 `assets/website.css` 与全局 tokens（项目约定）。

被否决的替代方案：按「list / detail / edit」分层建公共目录（把产品与资讯混在同一层，正是要消除的相互抄近路）；只重命名不拆子组件（`product-edit.vue` 继续膨胀，图集与规格控件无法在别处复用）。

### D3 `specs` 形态定为有序「参数名—参数值」数组，服务端读写校验

写入侧：`specs` 由 `z.any()` 收紧为 `z.array(z.object({ label, value })).max(20)`，`highlights`/`gallery` 同批收紧上限（卖点 8、图集 8）。存储侧：列默认值 `'{}'` 改 `'[]'`，迁移把存量的 `{}` 归一为 `[]`。读取侧：详情组件不再做形态兜底。

替代方案与否决理由：保持 `z.any()` + 前端各自兜形（现状）——形态没有唯一真相，官网与管理端各写一套转换，是本次「录了不确定能用」的根因；改成 `{k:v}` 对象——参数表要按录入顺序展示，对象的键序在 JSONB 里不可靠。

### D4 标识可变，靠唯一索引 + 事务保证并发安全

`PATCH` 的字段映射补入 `slug`，与 `POST` 一样走 `assertSlugFree` 式唯一校验；官网侧因此需要接受「改标识 = 旧地址立刻 404」，管理端在提交前给后果确认。并发用现有 `UNIQUE` 索引兜底，冲突转成中文可读错误而不是 500。

替代方案与否决理由：编辑态禁用标识（实现最省，但运营一旦打错一个字符就得删了重建，且已发布内容的地址由命名失误锁死）；为旧标识自动跳转（与 C1「不做自动跳转」的已确认规则冲突，且后端不托管 SPA，给不出真 301）。

### D5 两类内容的状态动作对齐，语义各自保留

管理端产品补 `publish`/`unpublish` 两个端点与 `api.cms.ts` 的对应方法，把「改 status」与「发布/下线」在代码上区分开（现在产品列表用裸 PATCH 乐观翻转，资讯用专用端点）。状态取值不动：产品仍 0/1（下架/上架），资讯仍 0/1/2（草稿/已发布/已下线）；文案统一由共享的状态映射常量产出，消灭「已下架/已下线」混用。

替代方案：把资讯压成两态（丢掉草稿能力，运营撰稿必须在发布前借分类或别处暂存）；给产品加状态 2（与「下架」语义重复，还要改 `CHECK` 约束，属破坏性变更）。

### D6 浏览计数改为显式上报 + 按访客窗口去重

写入从 `GET /public/articles/:slug` 中移出（避开 `max-age` 缓存与「GET 有副作用」），新增 `POST /public/articles/:slug/view`。服务端按「条目 + 访客指纹（IP 哈希 + UA 摘要）+ 24 小时窗口」判重，命中则不计数；为此新增明细表 `article_view_dedupe(article_id, visitor_key, seen_at)`，`view_count` 仍作为展示用的单调计数列，明细表按周清理。

替代方案：只在浏览器会话内去重（换标签、清 session 即绕过，服务端无保证）；按条目做 60 秒全局冷却（同秒的多个真实访客会被合并，明显低估）；把浏览量挪进 Redis 计数器（项目无 Redis，为一个小数引入新依赖不值）。

### D7 分类删除在应用层拦截，不动外键

删除前统计该分类下的引用数（含草稿与已下线），非 0 则返回 409 + 中文占用数量；`ON DELETE SET NULL` 的外键保持原样，作为「绕过应用层直接改库」时的兜底而不是常规路径。产品与资讯两个分类接口同批实现。

替代方案：把外键改成 `RESTRICT`（数据库层更严格，但错误信息不可读，需要一次性改两条 FK 定义，属破坏性 DDL，且对已有脏数据不友好）。

### D8 页面级三态与列表级空态分层，互不吞并

`products` / `news` 两个装修页本身遵循 C1 的严格规则：装修页未发布 → 整页品牌化 404；装修页已发布但列表区块取到 0 条 → **页面正常呈现 + 列表区空态**；列表请求失败 → 列表区可重试错误态。详情的「查无此条」与「取数失败」同样分两层，杜绝把失败并进 404 的现状写法。

替代方案：0 条即 404（新建分类、临时下架全部产品时官网出现死页，且运营无法理解）；失败也显示空态（掩盖故障，与 C1「失败与无内容必须可区分」冲突）。

### D9 种子数据 010：两分类 ×2 + 三产品 + 三资讯，图片沿用内置资产

迁移 `backend/sql/migrations/010_content_flow.sql` 做四件事：`specs` 列默认值改 `'[]'` 并归一存量 `{}`；建 `article_view_dedupe` 表；`articles` 新增可空列 `draft_json JSONB`（见 D11）；按 `WHERE NOT EXISTS` 幂等种入产品分类 2 个、资讯分类 2 个、产品 3 条、资讯 3 条（图片引用现有 `public/website/img/prod/*.png`，正文含一段带图与列表的富文本用于验证清洗与渲染），附反向脚本删除种子行并 `DROP COLUMN draft_json`。目的是让两条链可当场验收，不是给官网填真实商品。

替代方案：让运营手工录数据（验收要等素材到位，且每次回归环境都要重录）；只种分类不种内容（列表与详情仍无数据可验）。

### D10 资讯正文用 Tiptap 3，可用格式与后端清洗白名单逐条对齐

新增 `@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder` 四个包（实测 3.32.0，MIT，StarterKit 的依赖树恰好是 `Document/Paragraph/Text/Heading/Bold/Italic/Underline/Strike/Code/CodeBlock/Blockquote/BulletList/OrderedList/ListItem/Link/HorizontalRule/HardBreak` + 撤销重做），落在 `views/admin/content/article/components/RichBodyEditor.vue`：工具栏用 Element Plus 按钮 + `@element-plus/icons-vue` 图标自绘（项目约定后台不引 iconfont），图片插入调用现有 `MediaPicker`（素材库）并只取其回传地址，不新增上传入口、不放行编辑器直传。

能力边界由清洗规则反推，装扩展时按这份清单裁剪：`Heading` 限 `h2/h3/h4`（`h1` 留给页面标题）、`TextAlign`/`TextStyle`/`Color`/`Highlight`/`Indent` **一律不装**——它们靠 `style` 或 `class` 表达，而 `style` 全剥、`class` 只在 `img` 上保留，装了就会出现「编辑器里好看、存进去就打回原形」。`Table` 也不装：标签虽在白名单里，但列宽 `colwidth` 属性会被剥，表格存下来必然失真。`CodeBlock` 保留但官网不做语法高亮（`language-*` class 会被剥）。粘贴依赖 ProseMirror 的 schema 过滤，不做 Word 保真解析。

被否决的替代方案：
- **wangEditor 5**（`@wangeditor/editor` 5.1.23 + Vue3 封装只有 `next` 标签 5.1.12）——中文文档与开箱工具栏最省事，但 2023 年后停止维护，输出大量内联 `style` 与 `data-*` 属性，要在官网保住效果必须同时放宽 `sanitize-html` 放行 `style`，等于为编辑器重写安全边界；不做富文本能力裁剪时它与 D10 的「所见即所得 = 官网所得」直接冲突。
- **Quill 2**（2.0.3）——自带 UI、体积适中，但格式靠 `ql-*` class 表达，class 除 `img` 外同样被剥，官网还得再引一份 Quill 样式表才能显示；Vue 3 没有官方封装，包装层要自己写。
- **原生 `contenteditable` + `execCommand`**——零依赖，符合「不轻易新增依赖」，但 `execCommand` 已被废弃、各浏览器行为不一致，粘贴清洗与撤销栈都得自写，正文是官网门面，不值得为省 4 个包换不可靠实现（本条是对项目约定的**有意例外**，已在 `openspec/config.yaml` 登记）。

### D11 资讯草稿落在 `articles.draft_json`，发布在一个事务里覆盖正式列

`articles` 新增可空列 `draft_json JSONB`，只存「尚未发布的改动」涉及的字段（正文、标题、摘要、封面、分类、标签、作者、标识）。规则按状态分岔，避免草稿态出现两份内容：

- 草稿（0）与已下线（2）：`PATCH` 照旧直接写正式列——线上本来不可见，无需保护
- 已发布（1）：`PATCH` 只写 `draft_json`，正式列不动；管理端列表用一列标记「存在未发布的改动」
- `POST /articles/:id/publish`：在一个事务里读 `draft_json` → 清洗正文 → 覆盖正式列 → `draft_json = NULL` → `status = 1`、`published_at = COALESCE(published_at, NOW())`；`draft_json` 为空时只改状态，重复执行结果相同
- 新增 `POST /articles/:id/discard-draft`（或 `PATCH` 显式清 `draft_json`）放弃改动，编辑页回到线上内容
- 发布前校验：`draft_json` 的正文清洗后为空（`<p></p>`、纯空白）则 400 拒绝，线上内容保持不变

被否决的替代方案：
- **沿用单列、编辑即改线上**（现状，零迁移）——运营改一半保存，官网立刻显示半成品，正是要消除的风险
- **编辑已发布内容时自动转草稿并下线**——零迁移且没有半成品，但每次修订都会让官网文章消失到发布为止，形成真空期，也不符合「下线」的语义
- **`pages` 式的 `content_json`/`draft_json` 双份全量**——两列存整份记录最对称，但资讯的字段是散列而非 JSON 块，双份全量要求每个字段两列、读写映射翻倍；只存差量的 `draft_json` 用一列达到同样效果
- **走 C2 的 `page_versions` 版本表**——本 change 只要「线上/待发布」两态，版本历史与审核链是 `page-publication-approval` 的范围，不在这里提前铺开

## 对既有 change 的修订

- `site-runtime-link-integrity`：D2 由「合并为单一 `Option.vue`」改为「统一路由 + 两目录各自实现」；`tasks.md` 第 3 组的 3.1/3.5/3.9 相应改写，删除对象从「两个旧组件」变成「两个旧组件文件位置」；`specs/page-routing/spec.md` 里「同一详情组件按类型取数」的表述改为「同一地址形态按类型分别渲染」
- **迁移编号冲突（两份 change 都受影响）**：`backend/sql/migrations/` 里已存在 `005_pages_schema_version.sql` 与 `006_site_logo.sql`，因此 C1 的 `005_fixed_nav_rows.sql` → `007`、C2 的 `006_page_workflow.sql` → `008`、C3 的 `007_block_templates.sql` → `009`，本 change 用 `010`

## Risks / Trade-offs

- [目录重组改动 8 个文件的 import 与路由，容易漏改] → 只做 `git mv` + 同批 `router/index.ts` 修改，改完立刻跑 `vue-tsc` 全量检查；管理端地址不变，可用「侧栏逐条点击」快速回归
- [slug 可变带来官网地址失效] → 提交前后果确认 + 审计留痕；不做自动跳转是已确认取舍
- [浏览去重明细表随流量增长] → 按周清理任务（同一迁移脚本内可重复执行的 `DELETE`）；上线初期量级下无压力
- [种子数据被误当成真实商品信息] → 迁移注释与 `title`/`summary` 明确写「示例数据」，反向脚本随时可删；正式素材到位后由运营替换
- [specs 收紧上限后，历史超长数据保存失败] → 迁移阶段先统计现有行的数组长度，超限值不截断、在验收清单里点名由运营确认
- [与 C1 的实现顺序耦合] → C1 的路由与严格 404 未完成时，本 change 的详情仍可按旧地址验证渲染正确性，只有地址断言推迟到 C1 之后
- [新增的 4 个编辑器包与后端清洗白名单不一致，出现「编辑器里好看、存进去失真」] → 按 D10 的裁剪清单与 `backend/src/lib.ts` 的 `SANITIZE_OPTS` 逐条对照，不装靠 `style`/`class` 生效的扩展；验收含「保存 → 重新打开编辑器 → 与官网渲染三者比对」
- [`PATCH` 已发布资讯的语义改为只写草稿，调用方误以为保存即生效] → 这是 **BREAKING**，在 proposal 标注；编辑页拆「保存草稿改动」与「发布」两个动作并显示未发布改动标记，`api/cms.ts` 的方法注释点名分岔
- [`draft_json` 存差量，字段清单漏项会让某个字段永远发布不上去] → 覆盖逻辑集中在一个函数里按固定字段清单读写，清单同时写进迁移注释与 spec 场景；发布成功后 MUST 置 `NULL`，可用「改了必上线」一条断言测出漏项

## Migration Plan

1. 后端契约：`specs`/`highlights`/`gallery` 校验、`PATCH` 补 `slug`、分类删除引用保护、产品 `publish`/`unpublish`、浏览计数显式端点（`backend/src/routes/content.ts`、`public.ts`）
2. 数据：执行 `010_content_flow.sql`（specs 归一 + 去重表 + `articles.draft_json` + 种子），核对种子行可读
3. 后端草稿分岔：`PATCH /articles/:id` 按状态决定写正式列还是 `draft_json`，`publish` 在事务内覆盖并清草稿、拒绝清洗后为空的正文，放弃改动端点（`backend/src/routes/content.ts`）
4. 前端目录：`git mv` 成四个目录，拆出图集/规格子组件，修 `router/index.ts` 的 import，`vue-tsc` 通过
5. 资讯正文富文本：装 4 个包，`views/admin/content/article/components/RichBodyEditor.vue` 按 D10 清单配扩展与工具栏，图片走 `MediaPicker`，编辑页换成两个动作并加未发布改动标记
6. 官网详情：`products/detail.vue` 与 `news/detail.vue` 去掉写死区头与占位图，接入按访客去重的计数上报，地址按 `/option/:type/:slug` 挂到统一路由（依赖 C1 完成）
7. 官网列表：产品与资讯列表区块的空态/错误态分离，跳转地址统一到 `/option/*`（与 C1 第 4 组同批）
8. 验证：`tsc`/`vue-tsc`、三个 spec 的场景走查（产品走「录入→上架→列表→详情→下架→404」，资讯走「富文本撰稿→保存→线上不变→发布→线上更新→再编辑→放弃改动→下线→404」）、删分类被拒的占用数量核对

回滚：前端目录重组是一次独立提交，`git revert` 即恢复；富文本与草稿分岔各自独立提交，可单独回退（回退后正文仍是清洗过的 HTML，编辑器只是退回文本域）；数据侧执行 010 反向脚本（删种子行、删 `article_view_dedupe`、`DROP COLUMN draft_json`、`specs` 默认值回 `'{}'`）；后端其余契约改动向后兼容读取（不改任何既有列语义）。

## Open Questions

- 正式产品图与资讯封面由谁提供、走素材库上传还是沿用 `public/website/img/` 内置资产（本 change 先用内置资产占位）
- `price_text` 与 `buy_link` 是否需要校验天猫/京东域名白名单，还是纯文本自由填
- 浏览去重窗口取 24 小时是否合适（另一个常见口径是 7 天，取决于是否把回访算作新浏览）
- 产品分类层级（后端 `parent_id` 已支持、UI 无入口）是否随本次一起做
- 产品是否也要同样的草稿分离（本 change 判定「下架」即天然保护态，编辑上架中的产品仍即时生效——若运营要求改价格也要先存草稿，再补 `products` 侧同构改动）
- 正文是否需要「表格」这一能力（当前按 D10 不装，因为列宽属性会被清洗；若必须有表格，要先放宽 `sanitize-html` 的 `col`/`td` 属性白名单）
