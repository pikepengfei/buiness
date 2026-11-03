## Context

资讯链的现状（本轮逐一读过代码与库）：

- 正文是 HTML 源码文本域：`article-edit.vue` 自陈「不引入富文本依赖」（[article-edit.vue:5](../../../buinessweb/src/views/admin/content/article-edit.vue)），运营手写标签（[:163](../../../buinessweb/src/views/admin/content/article-edit.vue)）。
- 只有一份 `body`：`PATCH /articles/:id` 直接覆盖（[content.ts:266](../../../backend/src/routes/content.ts)），半成品实时上线；`articles` 表没有草稿列，项目里唯一的草稿范式是 `pages.content_json`/`draft_json` 双列（[schema.sql:141-142](../../../backend/sql/schema.sql)）。
- `PATCH` 的映射不含 `slug`（[content.ts:262](../../../backend/src/routes/content.ts)）；状态 2 在编辑页叫「已下架」而列表与后端叫「已下线」；`POST /articles` 允许 `status=1` 且 `body` 可选（[content.ts:243](../../../backend/src/routes/content.ts)、[:250](../../../backend/src/routes/content.ts)）；`DELETE /articles/:id`（[content.ts:289](../../../backend/src/routes/content.ts)）是无外键约束的裸删除。
- 清洗白名单实测（[lib.ts:54-63](../../../backend/src/lib.ts)）：`style` 一律剥除，`class` 仅在 `img` 上保留，`a` 只留 `href/target/rel`（`name` 被剥），`img` 留 `src/alt/width/height/loading/class`（`srcset`、`title` 都被剥）；`srcset` 只在 `source` 上保留，而编辑器不产出 `<picture>/<source>`。**这条决定了富文本的能力边界。**（2026-10-29 按 6.8/10.8 的粘贴走查复核订正：原文写的 `a@name`、`img@srcset/title` 三项实际不保留。）
- **公开详情接口不下发分类名，推荐项连标签都不带**：`/public/articles/:slug` 是 `SELECT *`（[public.ts:124](../../../backend/src/routes/public.ts)），相关资讯子查询只取 `id,slug,title,cover_image`（[public.ts:128](../../../backend/src/routes/public.ts)）；前端读 `article.category`（[Article.vue:73-79](../../../buinessweb/src/views/website/Article.vue)）与推荐卡片的 `r.category`、`r.tags`（[:108](../../../buinessweb/src/views/website/Article.vue)）→ 元信息分隔符错位、每张卡片显示写死的 `'NEWS'`。列表接口反倒 join 了分类名（[public.ts:116](../../../backend/src/routes/public.ts)），搜索接口也没 join（[public.ts:172](../../../backend/src/routes/public.ts)）。
- 浏览量在 GET 里自增（[public.ts:126](../../../backend/src/routes/public.ts)），而 `/public/*` 统一带 `max-age`（[public.ts:23-29](../../../backend/src/routes/public.ts)，默认 60 秒，[config.ts:29](../../../backend/src/config.ts)）：同一缓存副本被多人命中时计数丢失，刷新即虚增；「发布即时生效」的断言同样在窗口内不稳定。
- 详情页区头写死「新闻资讯 / 详情」，取数失败与查无此条并入同一个 `notFound`。（错别字「新闻咨询」已于 2026-10-29 直接订正代码与 `schema.sql` 基线，库内旧值由 C1 迁移 007 收敛；本 change 负责去掉这块硬编码区头。）
- 库里 `articles` 只有 1 条手工遗留行（`大法师的`，`status=1`），没有覆盖草稿 / 在线 / 下线各形态的样例，资讯链无法端到端验收。（原文写「0 行」，2026-10-29 连库核对后订正。）

**本轮闭环审计的结论。** 上面这些缺陷合起来构成四个断点：① 写入落点与读取来源不是同一份（保存后重开编辑页读不到自己刚存的内容，或更糟——线上直接被半成品覆盖）；② 分类名与推荐归属信息在详情与搜索两条下发路径上缺失，前端恒落到写死文案；③ 浏览计数由 GET 触发且被响应缓存吞掉，既不真也不即时；④ 引用关系没有级联语义，`article_view_dedupe` 这类明细表会留下指向不存在 id 的孤儿行。本 change 以 **D10 的双表模型**闭合 ①，D5 闭 ②，D6 + D5 闭 ③，D12 闭 ④。

**依赖关系。** 本 change 依赖 `site-runtime-link-integrity`（下称 C1）的固定地址白名单与严格 404；详情地址形态本轮已按「两条独立路由」修订 C1 的 D2、`page-routing` 与第 3/4 组，资讯侧形态定为 `/article/:slug`。与 `product-content-flow`（产品链）的唯一重叠文件是 `router/index.ts` 与 `public.ts` 的缓存钩子，边界见 D2 与 D5；**产品链现已按同构双表落地**（`010_product_flow.sql` 建 `product_drafts`，线上表只放已上架行），两链各自持有表、状态文案常量（本链 `ARTICLE_STATE_TEXT`：已上线/已下线；产品链 `PRODUCT_STATE_TEXT`：已上架/已下架）与私有编辑器，互不 import、互不牵制。富文本编辑器与 `decoration-editor-toolkit`（装修区块表单）只在「编辑器」一词上重名，两处不共用实现。

## Goals / Non-Goals

**Goals:**

- 打通资讯「撰稿 → 保存 → 发布 → 官网列表 → 官网详情」：一条资讯同一时刻只存在于一张表，未发布内容独立成表，**正在上线的那一行不可编辑、不可删除，唯一动作是下线**——编辑半成品不可能出现在官网，因为要改必须先让它离开官网
- 正文改为所见即所得富文本，可用格式与后端清洗白名单严格对齐，做到「编辑器产出 = 清洗后保留 = 官网渲染」
- 修掉四处真实契约缺陷：标识静默丢弃（收敛为服务端生成且冻结，见 D3）、详情分类名与推荐标签缺失、浏览计数失真且无展示口径、删分类静默改归属
- 让「发布即时生效」在响应缓存层面成立，而不只是接口层
- 非空正文成为上下限，同时覆盖创建与发布两条路径
- 引用关系全部带级联语义：删发布行时其浏览明细一并清理，不留孤儿行
- 资讯功能落成管理端与官网两个独立目录，正文编辑器私有，与产品实现零相互引用
- 补上可验收的资讯种子数据，三种形态（草稿 / 已上线 / 已下线）各有样例行
- 每条资讯带一个跨表稳定的身份（`uid`）与「最近由谁改动」的记录（`updated_by`），谁在何时改了哪些字段可从审计日志按同一条资讯串起来看

**Non-Goals:**

- 不做正文的版本历史、多人协同编辑与 Word 保真粘贴（富文本只到「能力边界内的格式不失真」）；「修改人 + 改动留痕」只记最近一次修改者与逐字段差异，不做可回滚的历史版本列表
- 不做「线上内容 + 待发布副本」并存那一版设计：一条资讯同一时刻只在一张表里，没有副本、也没有「是否存在未发布改动」这个状态
- 不给已上线内容提供删除入口：`DELETE /articles/:id` 保留在代码里但界面与文档都不对外使用，删除一律作用于草稿表
- 不改 `pages` 表的 `content_json`/`draft_json` 双列范式：双表方案只作用于资讯，装修页继续用它的既有范式
- 不做产品的任何改动（`specs` 形态、上下架端点、产品公开接口缓存头归 `product-content-flow`）
- 不做定时发布、批量操作、多语言版本
- 不改 `pages` 表与装修区块结构；详情页不作为装修页；装修区块的属性表单不接富文本
- 不改 `backend/src/lib.ts` 的清洗白名单——富文本按它裁剪，不放宽 `style`/`class`

## Decisions

### D1 资讯详情独立成一条路由 `/article/:slug`，与产品详情彻底分轴

`router/index.ts` 为两条详情各注册一条独立记录：`article-detail` → `/article/:slug` → `views/website/news/detail.vue`；产品侧 `product-detail` → `/product/:slug` 由 `product-content-flow` 与 C1 承接。两条记录各自维护 `meta.title`、面包屑上级与取数，共用件只有接口客户端、类型与区块渲染器。列表页 `/news` 不变，旧的 `/news/:slug` 随 C1 移除且不配自动跳转；`/news` 列表的 `meta.title` 错别字「新闻咨询」已订正为「新闻资讯」（2026-10-29 直接落代码，库内旧值由 C1 迁移 007 收敛）。

被否决的替代方案：

- **`/option/:type/:slug` 一条形态、两个组件**（上一版的选择）——`type` 段是两条链的共享约定，新增第三类内容要先改白名单，两链的地址规则绑在同一份 spec 上，与「彻底分轴、各自闭环」冲突。
- **`/option/product/:slug` + `/option/article/:slug`（同一前缀拆两条记录）**——与上一版已定的统一形态同源、改写量最小，但前缀无语义，两条链仍共用一段痕迹；用户明确选择形态可读的独立地址。
- **保留 `/news/:slug`**——零迁移，但列表 `/news` 与详情 `/news/:slug` 同段嵌套，面包屑与导航高亮判定要特例处理；同样要改 C1 的第 3/4 组，省不下多少返工。

命名风险须记录：`/article` 与列表 `/news` 词根不一致（产品侧是 `/product` 与 `/products` 只差一个字母）。缓解靠 C1 的固定白名单——错拼落进兜底 404 而非半渲染页，站内链接一律由代码生成。

### D2 两个功能目录的布局与文件命名

| 目录 | 文件 | 由何而来 |
|---|---|---|
| `views/admin/content/article/` | `index.vue` `edit.vue` `categories.vue` `components/RichBodyEditor.vue` | `views/admin/content/{articles,article-edit,article-categories}.vue`；正文编辑器从编辑页新拆出，只挂在资讯编辑页内（见 D9） |
| `views/website/news/` | `index.vue` `detail.vue` `components/` | `views/website/{News,Article}.vue` |

`git mv` 保留历史。`router/index.ts` 的记录归属边界：**列表页与管理端界面的 import 路径由本 change 改**；`/article/:slug` 这条记录的**新增与 `/news/:slug` 的移除归 C1 第 3 组**，本 change 只保证被指向的文件存在于新位置——两 change 不同批时，C1 先挂原 `Article.vue` 路径。样式继续写在各自 SFC 的 scoped style，不动 `assets/website.css` 与全局 tokens（项目约定）。

被否决的替代方案：把 `RichBodyEditor.vue` 放共用 `components/` 供装修区块复用（区块表单只需要单行输入，复用只会把安全边界拖宽）；按「list / detail / edit」分层建公共目录（把产品与资讯混在同一层，正是要消除的相互抄近路）。

### D3 标识由服务端在创建时生成，一经生成即冻结

标识不再是运营的输入项：`POST /articles` 在落库前生成 `a-{6 位 [a-z0-9]}` 短码写入 `slug`，并随创建响应（`{id, uid, slug, stripped_images}`）下发给管理端只读回显；`draftCreateSchema` 与 `DRAFT_FIELDS`（PATCH 映射）都不含 `slug`，外部提交的标识被 zod 默认剥离。原口径「草稿改标识不惊动官网、已下线改标识要重新发布才生效、风险窗口在下线瞬间」整段作废——标识根本不再被人改，界面也随之撤除「当前可用地址 / 待生效地址」两行显示与下线确认里的旧地址失效提示，只剩「标识由系统生成，改名不影响官网地址」一句说明。

唯一性由**生成时的跨两表占用判定**承担：`isContentSlugTaken('articles', 'article_drafts', slug)` 同时查两张表（只查本表会漏判「生成出某个在线条目已占用的标识」，那种冲突要等到发布事务里才炸，是运营最不预期的时刻）；分类只有一张表，走 `isSlugTaken('article_categories', slug)`。重试上限内每次都撞车就放手让 `INSERT` 去碰 `UNIQUE (slug)`，全局 23505 → 409，**不静默改名**。搬运（发布/下线）仍在事务内做同标识冲突判定（`slug_online` / `slug_draft` 两条 kind），因为存量手工填写的标识可能本来就互相冲突，那是搬不动的历史事实，不能因为改了生成方式就假装不存在。`uid`（D13）不在任何白名单里，跨表搬运不改标识归属。

替代方案与否决理由：**拼音/中文转写生成**（多音字与生僻字不可靠，标题转出一长串既不可读也更容易撞车，且项目约定不为此新增 npm 依赖）；**保留输入框只加默认值**（仍可改成任意字符串，格式校验、唯一性预检与后果提示一个都删不掉，本链缺口清单里的三条不对称全部保留）；**外部提交标识返回 400**（为一个本该不存在的字段开出校验与测试路径，老客户端整笔请求失败，比静默丢弃更难排障）；**为旧标识自动跳转**（与 C1「不做自动跳转」冲突，后端不托管 SPA 也给不出真 301）；**迁移存量标识成统一短码**（等于批量改官网地址，`articles` id=7 那条中文标识也一并失效，需求方已确认不动存量）。

### D4 三态语义与命名单一来源，状态判据是「在哪张表 + 草稿表的 `state`」

仍是三个称谓，但**线上那一态的文案由「已发布」改为「已上线」**——`ARTICLE_STATE_TEXT` 的键 `published` 与类型 `ArticleState` 都不动，只改这一处中文值，动作名继续叫「发布」，与「下线」配成对；spec 与界面一律用「已上线」指代在线状态。**2026-10-30 修订后判据不再看 `articles.status` 一列**：草稿 = 草稿表里 `state=0` 的行；已上线 = 发布表里有行（`status` 恒为 1，`CHECK` 收窄为只允许 1，见 D12/D14）；已下线 = 草稿表里 `state=2` 的行。也就是说「下线」既是一个状态也是一个位置——整行从发布表搬回草稿表并标 2，官网因此查不到它。草稿表新增 `state SMALLINT NOT NULL DEFAULT 0`，`articles.status` 退化为「这行是否在线」的存在性证明，公开接口仍按 `status=1` 过滤，读法不变。称谓由服务端单一常量产出，前端筛选、行内按钮、表单下拉引用同一份；编辑页的「已下架」订正为「已下线」。新建默认草稿（`state=0`）且不写发布时间；`published_at` 只在首次发布写入并随后续搬运随行保留，再次上线不覆盖。

列表行的字段随之收敛：不再有 `has_unpublished_changes`，也不再有 `published_id`/`draft_id`（D10 修订后 `published_id` 列被 `DROP`）；一行只有一个 id 与一个来源标记 `origin`（`online` / `draft`，标明 id 属于哪张表），加上跨表稳定的 `uid`（D13）与 `updated_by` 姓名。行操作按 `origin` 选择端点，写请求同时带上 `uid` 让服务端校验「这个 id 确实是这条内容」——两表主键各自递增，数字相同不代表同一条内容；改动历史按 `uid` 查。

替代方案：把三态压成两态（丢掉草稿能力，运营撰稿必须在发布前借分类或别处暂存）；发布表保留 `status=2` 表达下线（那就是上一版「下线是状态不是位置」，已被推翻：它让线上行既能被 `status` 改动、又留在官网的可见集合边缘，删除与编辑的收口都要额外加判据）；一表两态靠 `status=0` 表达草稿（D10 已否决，官网每条查询都要多带一个 `status<>0` 的护栏才能防住漏筛）。

### D5 官网只读发布表，分类名与推荐标签一次下发，公开接口退出 `max-age`

三处改动合在一个决策里，因为它们修的是同一批请求：

1. `/public/articles/:slug` `LEFT JOIN article_categories` 返回分类名称；相关资讯子查询补分类名称与 `tags`（与列表接口的形态对齐）。无值时返回 `null`，前端按空值隐藏标识，删除 `|| 'NEWS'` 兜底。**实测这一兜底原有 5 处**——只有前两处能靠详情接口修好，后三处走列表与搜索接口。第 8 组已全部移除，当前位置：[detail.vue:125](../../../buinessweb/src/views/website/news/detail.vue)（正文头部的 eyebrow）与 [:162](../../../buinessweb/src/views/website/news/detail.vue)（相关推荐标签）、[SecLatestNews.vue:40](../../../buinessweb/src/website/sections/SecLatestNews.vue)、[SecNewsFeed.vue:149](../../../buinessweb/src/website/sections/SecNewsFeed.vue)、[Search.vue:115](../../../buinessweb/src/views/website/Search.vue)（原路径为 `views/website/Article.vue` 的两处，随目录重组搬入 `news/detail.vue`）。
2. `/public/search` 的资讯分支（[public.ts:172](../../../backend/src/routes/public.ts)）同样只取 `id,slug,title,cover_image,summary`，补 `c.name AS category` 的 join，否则搜索结果的分类行仍会落到写死文案。这是断点 ② 里独立于详情的第二条路径。
3. 资讯公开只读接口（详情、列表、分类、搜索）改协商缓存 `no-cache` + ETag，沿用 `/public/site` 已有做法：未变更时 304 不重复传输，变更后立刻可见。这一步同时修好 D6 的计数读值滞后（GET 不再自增后，读到的必须是最新值）。

**双表下的读取边界**：这些接口一律只查 `articles`，MUST NOT join 或 union `article_drafts`。草稿泄漏到线上的可能性由数据库结构本身排除——未发布与已下线的内容在发布表里根本没有行，`status` 又恒为 1，所以「草稿不可见」不再依赖每条 SQL 记得写过滤条件。详情未命中时返回 `null`（[public.ts:125](../../../backend/src/routes/public.ts)），由 C1 的兜底 404 承接。

替代方案与否决理由：前端再发一次 `/public/article-categories` 自行映射 id→名称（多一次往返、多一处时序，且推荐项的标签仍拿不到）；只把 `max-age` 调小（把「即时」降级成「延迟可控」，spec 断言仍不成立，验收仍不稳定）；给公开接口彻底关掉缓存（丢掉 304 复用，列表区块每次全量传输）；让官网接口按状态回退去读草稿表（那等于把未上线内容漏进线上，正是本 change 要消除的）。

### D6 浏览计数改为显式上报 + 按访客窗口去重 + 详情可见

写入从 `GET /public/articles/:slug` 移出，新增 `POST /public/articles/:slug/view`。服务端按「条目 + 访客指纹（IP 哈希 + UA 摘要）+ 24 小时窗口」判重，命中不计数；为此新增明细表 `article_view_dedupe(article_id, visitor_key, seen_at)`，`view_count` 仍作为展示列，明细按周清理。展示口径：详情页元信息区显示 `view_count`，为 0 时不显示；上报异步、失败静默。

双表下的四条附属约定（2026-10-30 随「下线即整行搬回草稿表」重写）：**其一**，`view_count` 两张表都有列——在线时只写发布行，下线时那一行连同计数一起搬进草稿表（`state=2`），再上线再原样搬回，所以「下线—编辑—再发布」不会把攒下的计数清零，这也是草稿表需要携带 `view_count`/`published_at`/`created_at`/`created_by` 的唯一理由；纯新草稿的计数恒为 0。**其二**，`publish` 的覆盖清单**不含** `view_count`，搬运走的是整行的列对列 `INSERT … SELECT`，计数不经过任何算术。**其三**，`article_view_dedupe.article_id` 必须带 `REFERENCES articles(id) ON DELETE CASCADE`——这就是断点 ④；没有它则删除资讯后明细表里留着一堆指向不存在 id 的行并继续被写入，只加外键不加级联又会让「删一篇被人看过的资讯」直接报 500。**其四**，代价要写清：既然「删除发布行」是下线唯一的实现方式，级联就会连带清掉该条的判重明细，**下线再上线等于重置那 24 小时窗口**，同一访客上线后会被再计一次。这是本修订接受的后果（判重只是防刷，不是审计口径），验收时按「一次下线—上线循环至多多计一次」判定，而不是「计数绝对不变」。

上报按发布行的 slug 定位（`WHERE slug=$1 AND status=1`）：内容还没上线、或已下线时，上报与详情都拿不到行，返回不计数；因此不存在「草稿改了标识但尚未发布，访客走旧地址导致计数分裂」的情形——线上只有一份可被访问的行，且自 D3 起标识一经生成即冻结，这条分裂路径在结构上无法出现。

替代方案：只在浏览器会话内去重（换标签、清 session 即绕过，服务端无保证）；按条目做 60 秒全局冷却（同秒的多个真实访客被合并，明显低估）；把浏览量挪进 Redis 计数器（项目无 Redis）；只在后台统计不给官网展示面（那 9.x 的计数验收只能查库，且 D6 声称的「展示用」列名不副实）；把 `view_count` 抽成按 `uid` 累计的独立统计表（多一张表、每次展示多一次聚合，为的是让级联碰不到计数；本修订选择让计数随行搬运，代价只有「下线会重置判重窗口」这一条可接受的后果）。

### D7 分类删除在应用层拦截，引用数跨两表统计

删除前统计该分类下的资讯引用数，**两张表都要算**——`articles`（正在上线的）与 `article_drafts`（草稿与已下线的）各有一份 `category_id`，漏掉草稿表就会删掉「只有草稿或已下线内容在用」的分类，那些行的归属被静默清空。非 0 返回 409 + 中文占用数量；两张表的 `ON DELETE SET NULL` 保持原样，作为绕过应用层直接改库时的兜底。产品分类保护由 `product-content-flow` 同形实现，两端各自统计各自的表。

替代方案：外键改 `RESTRICT`（错误信息不可读，需改 FK 定义，属破坏性 DDL，且对已有脏数据不友好）；只统计发布表（草稿与已下线内容的归属会被静默清空，与本 change 的「未上线内容同样受保护」自相矛盾）。

### D8 页面级三态与列表级空态分层，互不吞并

官网新闻资讯页遵循 C1 的规则：装修页未发布 → 整页品牌化 404；装修页已发布但列表区块取到 0 条 → 页面正常呈现 + 列表区空态；列表请求失败 → 可重试错误态。详情的「查无此条」与「取数失败」同样分两层。已下线资讯的详情地址必须 404 **且不再累加计数**（上报端点同样按 `status=1` 判）。双表让这个分层有了结构支撑：草稿在发布表里根本没有行，「未发布内容不可经地址访问、其标题与摘要不得泄漏」不再是一条要靠 SQL 写对的规则，而是查不到就是查不到——与 C1 给装修页定的「未发布即不可见」同构。

### D9 资讯正文用 Tiptap 3，可用格式与后端清洗白名单逐条对齐

新增 `@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder` 四个包（实测 3.32.0，MIT，StarterKit 依赖树恰好是 `Document/Paragraph/Text/Heading/Bold/Italic/Underline/Strike/Code/CodeBlock/Blockquote/BulletList/OrderedList/ListItem/Link/HorizontalRule/HardBreak` + 撤销重做），落在 `views/admin/content/article/components/RichBodyEditor.vue`：工具栏用 Element Plus 按钮 + `@element-plus/icons-vue` 图标自绘（后台不引 iconfont 的项目约定），图片插入调用现有 `MediaPicker` 并只取其回传地址。

能力边界由清洗规则反推：`Heading` 限 `h2/h3/h4`（`h1` 留给页面标题），`TextAlign`/`TextStyle`/`Color`/`Highlight`/`Indent` 一律不装——它们靠 `style` 或 `class` 表达，而 `style` 全剥、`class` 只在 `img` 上保留；`Table` 也不装：标签虽在白名单里，但列宽 `colwidth` 属性会被剥，表格存下来必然失真。`CodeBlock` 保留但官网不做语法高亮（`language-*` class 会被剥）。粘贴依赖 ProseMirror 的 schema 过滤，不做 Word 保真解析。

被否决的替代方案：

- **wangEditor 5**——中文文档与工具栏最省事，但 2023 年后停止维护，输出大量内联 `style` 与 `data-*`，要在官网保住效果必须放宽清洗放行 `style`，等于为编辑器重写安全边界。
- **Quill 2**——自带 UI、体积适中，但格式靠 `ql-*` class 表达，`class` 除 `img` 外同样被剥，官网还得再引一份 Quill 样式表；Vue 3 无官方封装。
- **原生 `contenteditable` + `execCommand`**——零依赖，符合「不轻易新增依赖」，但 `execCommand` 已废弃、各浏览器行为不一致，粘贴清洗与撤销栈都得自写；正文是官网门面，不值得为省 4 个包换不可靠实现（本条是对项目约定的**有意例外**，已在 `openspec/config.yaml` 登记）。

### D10 未发布内容独立成表：`article_drafts`（可编辑）+ `articles`（只读线上）

> **2026-10-30 修订。** 本决策的初版是「下线是状态不是位置 + 副本行表示未发布改动」，011 已按它落地并全量走查。需求方随后推翻两处：**发布后的内容既不可编辑也不可删除，唯一动作是下线**；**下线的资讯与新建草稿一样存放在未发布表，只是多一个下线状态**。下面的正文已是修订后的口径，旧口径保留在「被否决的替代方案」里并写明为什么被推翻。配套的 D13（修改人与内容身份）与 D14（迁移 012）为本次新增。

草稿与线上分家落在**两张表**上，而不是同一张表的两列，且**一条条目永远只在其中一张表里**：

| 表 | 里面有什么 | 谁能写 |
|---|---|---|
| `articles`（发布表） | **只放正在上线的条目**，一行 = 一份线上内容；`status` 恒为 1 | 只有两个动作能写它：发布（新行落表）、下线（整行搬走）；编辑动作拿不到它的写路径 |
| `article_drafts`（草稿表） | 从未发布的条目 + **已下线回收的条目**（靠本表的 `state` 列区分，0=草稿 / 2=已下线） | 所有编辑动作与草稿删除 |

三种形态由此唯一确定：

- **草稿**：只在草稿表、`state=0`；从未上线，官网不可见
- **已上线**：只在发布表；**只读**——不给编辑入口，也不给删除入口，界面上唯一可做的动作是「下线」
- **已下线**：只在草稿表、`state=2`；等同于「一条可以编辑、可以删除、可以重新发布的条目」，与草稿的区别只有一个状态标签与「曾上线」的身份

配套规则：

- **编辑**只作用于草稿表的行（无论 `state=0` 还是 2）。已上线条目要先「下线」才能改：下线动作把发布行整行搬进草稿表并置 `state=2`，此后编辑写的就是这一行
- **不存在「线上 + 副本并存」这种形态**，因此没有「是否存在未发布改动」这个概念：`has_unpublished_changes`、`UNIQUE (published_id)`、「确保副本行」端点、界面上的「发布改动」按钮与「放弃改动回到线上内容」一律撤除
- **发布**：一个事务内把草稿行的固定列清单（正文、标题、摘要、封面、分类、标签、作者、标识）搬成发布行 → 删除草稿行 → 发布行 `status=1`、`published_at = COALESCE(草稿带下来的时间, NOW())`、`view_count` 与 `created_at/created_by` 从草稿行原样带下来。首次发布写发布时间，之后每次再发布都不覆盖它，浏览量也不清零
- **下线**：一个事务内把发布行整行搬进草稿表（含 `view_count`、`published_at`、`created_at`、`created_by`、`state=2`）→ 删除发布行 → 官网该标识立即 404。内容不丢，只是换表存放
- **删除**只有一种：删草稿表的行（`state=0` 与 `state=2` 都走它）。发布表的 `DELETE /articles/:id` 端点**保留在代码里但不对外使用**——界面无入口、文档标注为运维兜底，正常流程不可能产生「发布行需要删除」的状态
- **编辑页取数就是它所在的那一行**——断点 1（存进去读不到）在这种「单份内容搬运」模型下天然闭合
- 管理列表是两张表的**并集**，一条条目恰好一行：`origin`（`online` / `draft`，标明这一行的 id 属于哪张表）+ `id`（当前所在表的行 id）+ `state`（三态键 `draft` / `published` / `offline`，常量与文案沿用 011 那版不改，只换判据）+ `uid`，不再有一行两 id
- 官网三个只读接口（列表、详情、搜索）一律只查 `articles`，MUST NOT join 草稿表

**id 选择规则**：编辑与发布类动作按草稿行 id——`POST /articles/drafts`、`PATCH /articles/drafts/:draftId`、`DELETE /articles/drafts/:draftId`（删除草稿/已下线条目）、`POST /articles/drafts/:draftId/publish`（首次发布与下线后重新发布同一入口）；线上侧动作按发布行 id——`POST /articles/:id/unpublish`、`DELETE /articles/:id`（保留、不对外使用）。一条内容在两表之间怎么搬都不改它的身份，见 D13。

被否决的替代方案：

- **`articles.draft_json` 差量列**（最早的 D10 方案）——与 `pages` 的双 JSON 范式同构、迁移最省，但「哪一列属于线上」是靠每个读写点自觉遵守的隐式约定，漏一处就把半成品写上线上。双表把这条契约交给数据库本身。**这是当初改选双表的直接理由，本次修订不动。**
- **下线是状态不是位置**（2026-10-29 版）——`status=2` 的行留在发布表，重新上线不搬数据、线上内容不被草稿规则污染。被需求方推翻：「下线的资讯存储和新建草稿一样，在未发布表存放，只是多了下线的状态」。代价是下线要删发布行，浏览去重明细随级联清空（见 D14 与 Risks）。
- **线上内容允许原地编辑**（改造前的现状）——半成品实时上线，是断点 ① 的成因，本次明确禁止。
- **线上内容允许删除**（2026-10-29 版）——界面对已发布与已下线条目都渲染「删除线上」，靠两条 `ON DELETE CASCADE` 清理副本与浏览明细。被推翻：发布后的内容只能下线不能删。`DELETE /articles/:id` 因此降级为不对外使用的运维端点，级联 DDL 保留作为绕过流程直接改库时的兜底。
- **一张表加布尔列 `is_draft`**——两态混在一列时标识唯一索引要改成部分索引，唯一性判定反而要跨两态推理；两张表名正言顺，`CHECK` 各收各的

风险见 Risks 段的「搬运清单与 `uid`」「搬运不是原子的」「双 id 混淆」「下线即删发布行 → 判重窗口重置」「列表并集」「`entity_id` 口径混用」六条；跨两表的标识唯一性改由 D3 生成时的占用判定承担，搬运事务内的同标识复核仍保留（存量手工标识可能互相冲突）。

### D11 非空正文是上下限，站外图片在保存时剥除

两条约束都落在服务端写入路径，覆盖创建与发布：

1. **正文下限**：`sanitize` 后不含实际文字（空串、纯空白、`<p></p>`）的正文，既不能被发布，也不能在「新建即发布」这条串联路径上被跳过（创建端点不再收状态参数，见 D10）；拒绝时线上行与草稿行都不变。前后端判定口径一致（`<p></p>`、纯空白视为空）。
2. **图片归属**：保存时剥除指向站内素材库/上传目录与内置资产之外的 `img` 节点，保留其余文字与结构，并在响应里回传被剥除的数量供界面提示。清洗白名单不放宽，编辑器不提供直传或外链输入入口。剥除只发生在草稿表的行上（草稿与已下线条目同表），而发布要求正文非空，所以「剥完就空了」只会让发布被拒，不会让线上少内容。

被否决的替代方案：只在编辑器 UI 上限制、服务端不管（粘贴外链图片照样入库，spec 的承诺落空）；站外图片直接拒绝整次保存（粘贴一段带图的外部文章会整体失败，运营无法理解）；把外链图片自动下载入库（引入新的抓取与存储链路，超出本链范围，另案）。

### D12 迁移 011：新表 `article_drafts` + 发布表状态收窄 + 两条级联 + 四形态种子

> **本节是 2026-10-29 的执行记录，不再是被遵循的目标形态。** 011 已按下述五条落库并全量走查，本次修订不回改它（改了就和走查记录对不上）。其中第 1、2、4、5 条与「副本行」「发布表 `status=2`」相关的部分，已由 D14 的迁移 012 撤销或改写；判定「现在应该是什么样」请读 D10 + D13 + D14，本节只回答「库里已经发生过什么」。

迁移 `backend/sql/migrations/011_article_flow.sql` 按顺序做五件事，反向脚本逐条成对：

1. **建 `article_drafts`**：列与 `articles` 的可编辑列一一对应（`slug`、`title`、`cover_image`、`summary`、`body`、`category_id`、`tags`、`author`），另有 `published_id BIGINT REFERENCES articles(id) ON DELETE CASCADE` 与 `UNIQUE (published_id)`（一条已发布内容最多一份副本）。`slug` 在本表内 `UNIQUE`；`category_id` 沿用 `ON DELETE SET NULL`，与发布表同规则。两张表的列注释各写明「本表内容是否对外可见」，避免后来者猜。
2. **收窄发布表状态**：先把存量 `status=0` 行整行搬入 `article_drafts`（`published_id` 置空）再从 `articles` 删除，然后 `DROP CONSTRAINT articles_status_check` + `ADD CHECK (status IN (1,2))`——草稿在发布表没有行，状态 0 对 `articles` 已无意义。`status=2` 的行留在原表（见 D10「下线是状态不是位置」）。本地库执行前没有 `status=0` 行（只有 1 条 `status=1` 的手工遗留行），这一步在本地是空搬移但 `CHECK` 实打实生效——2026-10-29 连库核对 `articles_status_check = CHECK ((status = ANY (ARRAY[1,2])))`；`DROP CONSTRAINT IF EXISTS` 兜住该约束在某些环境本不存在的形态。
3. **给去重表补级联**：`article_view_dedupe(article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE, visitor_key, seen_at)` 与 `(article_id, visitor_key, seen_at)` 索引，附按周清理的 `DELETE`（可重复执行）。**没有这条外键就有断点 4**：`DELETE /articles/:id` 是裸删除，去重明细会留下指向不存在 id 的孤儿行并持续被写入；反过来若只加外键不加 `CASCADE`，一篇被人看过的资讯删除时会直接被约束挡下并报 500。同一规则必须在建表时给 `article_drafts.published_id` 也定下来——删发布行时它的待发布副本应一并消失。
4. **种入四形态验收数据**：按 `WHERE NOT EXISTS` 幂等种入资讯分类 2 个 + 内容 4 条，覆盖 D10 的四种形态——① 已发布且正文带图与有序列表（发布行）、② 已发布且带一份待发布副本（发布行 + 副本行，用于验收「存在未发布改动」与断点 1 闭合）、③ 纯草稿（只有草稿行、无作者无分类，用于验收官网不可见）、④ 已下线（发布行 `status=2`，用于验收下线不可见且不可编辑）。标题与摘要冠「示例」，图片引用现有 `public/website/img/prod/*.png`。
5. **反向脚本**：删种子行与种子分类（先副本后发布行，靠级联验证一次）、`DROP TABLE article_drafts`、`DROP TABLE article_view_dedupe`、把 `articles` 的 `CHECK` 恢复成 `(0,1,2)`；注释标明与正向脚本的执行顺序。

种入的正文只使用 D9 能力边界内的标签，因此种子行本身就是「编辑器产出 = 清洗后保留 = 官网渲染」三者一致的回归样本。与 `010_product_flow.sql`（产品链）无执行顺序依赖：动的是不同表与不同约束，仅编号连续登记。**该脚本现在的范围**（产品链落地后）：建 `product_drafts` 双表 + `products.specs` 默认由 `'{}'` 归一为 `'[]'` 并 `RAISE NOTICE` 报告超上限存量行 + `products` 加 `uid`/`updated_by`/`published_at` 且 `CHECK` 收窄为 `(status = 1)` + `inquiries.product_uid` 与索引（按 `product_id` 幂等回填）+ 四形态种子（已上架字段完整、已上架仅封面、草稿 `state=0`、已下架 `state=2` 带历史 `published_at` 与自定义 `sort`）。

替代方案：让运营手工录数据（验收要等素材到位）；与产品链共用一份迁移（拆链后任一侧回滚要连带另一侧，正是本次要消除的耦合）；把状态 0 保留在 `articles` 里当草稿行、靠 `status` 区分（那就是「一表两态」，D10 已否决，收窄 `CHECK` 也无从谈起）。

### D13 内容身份 `uid` 与修改人 `updated_by`：每次改动都能归到人和到条

需求方要求「资讯增加修改人字段，每次由谁修改进行记录」。落点三处，都不新建历史表：

1. **`updated_by`（最后修改人）**：`articles` 与 `article_drafts` 各加 `updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`，与既有 `created_by`（创建人）并列，列注释写明「最后修改人，不是创建人」。每个写路径都刷新它，值取 `req.user.id`——建草稿、保存、发布、下线、运维删除；下线搬运把当次操作人写进草稿行的 `updated_by`，发布搬运同理带到发布行。管理列表新增「修改人 / 修改时间」两列，编辑页头部常驻「最后由 X 于 T 修改」。
2. **`uid`（内容身份）**：两表各加 `uid UUID NOT NULL DEFAULT gen_random_uuid()` 与 `UNIQUE (uid)`。**同一条内容在两表之间搬动时 uid 不变**——发布把草稿行的 uid 带进发布行，下线把发布行的 uid 带回草稿行。D10 让一条条目在任何时刻只存在于一张表、行会被删除、id 会换，uid 就是那根不断线：`slug` 可改、`id` 随表换、`uid` 恒定。两表各自的 `UNIQUE (uid)` 还让「同一份内容两处存在」在结构上不可能。
3. **每次修改的记录走既有审计，不建 `article_revisions`**：`audit_logs(user_id, action, entity_type, entity_id, diff, ip, created_at)` 已经在每个动作上记了操作人与 IP，缺两件事——`diff` 从未被写入，`entity_id` 记的是「当前行 id」而不是内容身份。资讯侧改为：`entity_type` 统一为 `article`（不再有 `article_draft`），`entity_id` 写 **uid**，`diff` 填 `{ "fields": [列名…], "from": {…}, "to": {…} }`——只记被改的列与改前改后值，`body` 只记字数与摘要而不整份存（正文可达 256KB）。`GET /audit` 增加 `entityUid` 精确过滤参数（现有 `entityType`/`action`/`keyword` 保留），界面据此在列表行与编辑页提供「修改记录」时间线：时间 / 操作人 / 动作 / 改了什么。

被否决的替代方案：

- **只加 `updated_by`，不做 uid**：改动史仍按「草稿行 id」与「发布行 id」两段分裂，而发布与下线都是**删行**动作，行一删历史就挂在没人能反查的 id 上，「每次由谁修改」聚合不到一条内容上。
- **新建 `article_revisions` 全量快照表**：能逐版 diff、能回滚，但每次保存都复制一份正文，而本链没有任何「回到上一版」的要求；审计表已带操作人与 IP，重复一份存储只换来一个没人用的能力。真要版本回退应另立 change。
- **复用行 id（下线删行、再发布时显式插回同一 id）**：省掉 uid，但发布表主键由序列生成，显式回插依赖「这个 id 一定没被占用」的推理，而删行时 `article_view_dedupe` 的级联已经清空，id 相同也不代表历史还在。
- **把操作人写进 `articles.author`**：`author` 是**稿件来源署名**，展示在官网详情页，和「后台谁改的」是两回事，混用会让一次内部修订就改掉对外署名。

### D14 迁移 012：撤除副本机制、把已下线行回收进草稿表、补 uid 与修改人

011 已经执行过，本次不回填改它（它的形态是走查记录的依据），新增 `backend/sql/migrations/012_article_online_readonly.sql` 与成对反向脚本，按顺序做六件事：

1. **加列**：两表各加 `uid UUID NOT NULL DEFAULT gen_random_uuid()` + `UNIQUE (uid)`、`updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`；`article_drafts` 加 `state SMALLINT NOT NULL DEFAULT 0 CHECK (state IN (0,2))`。三条新列各写注释（内容身份 / 最后修改人 / 草稿与已下线的区分）。
2. **灌存量修改人**：`UPDATE articles SET updated_by=created_by WHERE updated_by IS NULL`，草稿表同形（本地遗留行 id 7 的 `created_by=1`，因此它有明确归属；`created_by` 为空的种子行留 NULL，界面显示「—」而不是猜一个人）。
3. **回收已下线行**：把 `articles.status=2` 的整行（含 `uid`、`view_count`、`published_at`、`created_at`、`created_by`、`updated_by`）插入 `article_drafts` 并置 `state=2`，再删除这些发布行。插入与删除同事务；若草稿表已有同 `slug` 的行则整笔中止并输出冲突清单，不做静默改名。执行后发布表只剩 `status=1` 的行，官网那批已下线详情地址的行为与迁移前一致（404），但内容从此可编辑。
4. **撤除副本机制**：现存 `published_id` 非空的草稿行是旧「未发布改动」形态，新模型里它不该存在。处置是 `state=0` + `published_id` 置空，使其降级为一条普通草稿，**保留其内容与标识、不丢数据、不改名**；它与原线上行同 `slug` 的冲突由应用层的跨表预检在下次保存时提示改名（`assertSlugFree` 会把「撞线上」讲清楚）。然后 `ALTER TABLE article_drafts DROP COLUMN published_id` 并随之去掉 `UNIQUE (published_id)` 与那条 `ON DELETE CASCADE` 外键。迁移末尾输出「因撤除副本机制而降级的草稿清单」（本地库当前 1 条：draft 1 / 原挂 pub 18；生产库 0 条，属兜底路径）。
5. **收窄发布表状态**：`articles` 的 `CHECK` 由 `(1,2)` 收为 `(1)`——发布表不再有已下线的行，状态 2 的语义移交草稿表的 `state`。列与 `ARTICLE_STATE_TEXT` 保留（对外仍是三态称谓），注释写明「恒 1，只作已上线标记」。
6. **重排验收种子**：011 的四种形态里「已发布 + 副本」与「发布表 status=2」两种已失效。本迁移按 `WHERE NOT EXISTS`（按 uid 与标识判存）幂等种入三形态样例：① 已上线且正文带图与有序列表、② 已上线另一条（供列表倒序与分页）、③ 草稿（无作者无分类）、④ **已下线：草稿表 `state=2`，带非零 `view_count` 与历史 `published_at`**（验收「下线后内容仍在、可编辑、可重新发布且计数延续」）。正文只用 D9 能力边界内的标签。

反向脚本按逆序：把 `state=2` 的草稿行搬回发布表并置 `status=2`、恢复 `CHECK (1,2)`、`ADD COLUMN published_id` 与其唯一约束（**旧副本关系无法恢复，注释标明这是本迁移唯一不可逆的一列**）、`DROP COLUMN state/updated_by/uid` 与两个 `UNIQUE (uid)`、删掉本次新种的样例，注释标明与正向脚本的执行顺序。`backend/sql/schema.sql` 基线同步新列、新约束与 `articles.status` 注释，并登记 011→012 的先后关系。与产品链迁移仍无执行顺序依赖，仅连续编号。

`article_view_dedupe.article_id → articles(id) ON DELETE CASCADE` 与它的索引**不动**：下线要删发布行，级联会清空该条的判重明细，这是 D10「下线即换表」的既成后果，写进 Risks；保留外键是为了运维端 `DELETE /articles/:id` 与绕过应用层直接删库时不留孤儿行。

## 对既有 change 的修订（本轮已落笔）

- C1 `design.md` D2 由「统一详情地址 + 按目录拆分实现」改为「两条独立详情路由」，地址表与迁移计划同步；`proposal.md` 第一条 BREAKING 改写
- C1 `specs/page-routing/spec.md`：白名单地址集合由 `/option/:type/:slug` 一条改为 `/product/:slug` 与 `/article/:slug` 两条，`type` 白名单校验规则随之取消（不再有类型段）
- C1 `tasks.md` 第 3 组（3.1/3.2/3.3/3.7/3.8）与第 4 组（4.1/4.4/4.5）的改写目标更新
- C1 `design.md` D7 与 `tasks.md` 2.8：新增「错别字数据订正」作为「迁移不改 `title`」的唯一例外——`menus` 里 `/news` 那行与 `pages` 里 `slug='news'` 的标题及三处装修文案由迁移 007 的 `UPDATE` 收敛（代码与 `schema.sql` 基线已于 2026-10-29 直接订正，已执行过的 002/004 不回改）。**本 change 不重复做这件事**，只在 4.4 核对残留入口
- C1 的「条目不存在或已下线 → 品牌化 404」**无需为双表改动**：未发布内容在发布表里没有行，落在同一条「查不到」路径上，语义不变；本 change 只把这条解读写进 D8 与 spec 场景
- `product-content-flow`：其 README/proposal/design 里对资讯侧的引用由「`draft_json`」改为「草稿表 `article_drafts`」。**本行原写的「产品侧仍不做草稿分离（该链 Non-Goals 不变）」已被产品链自己的实现推翻**：产品链已按同构双表落地（`010_product_flow.sql` 建 `product_drafts`、`products` 收窄为 `CHECK (status = 1)`），两链各自持有表与状态文案常量，不再有「一链双表、一链单表」的不对称
- `openspec/config.yaml`：编辑器例外的引用名改为 `article-content-flow`；目录组织约定里「跨目录只共用路由形态」改为「共用接口客户端、类型与区块渲染器」；内容流转那条约定的**旧表述与本链实现不符**（原文写「已发布内容的编辑先落成未发布改动，发布才在事务内一次性覆盖线上」，本链 012 的实现是「编辑只作用于未上线表的整行、发布走事务内整行搬运，线上行只读」），已由产品链回写为两链共同的形态
- 两链登记在案的不对称（**均不代对方改行为，留给各自那一条链**）：
  - ~~标识格式：本链只有 min/max、产品链有 regex~~ —— **该不对称已于 2026-11-02 消解**：两链同批改用服务端生成标识（D3），`draftCreateSchema` / `productDraftCreateSchema` 都不再含 `slug`，格式校验随之删除。新登记的残留不对称是装修页 `pages.slug` 仍由运营手填且只有 `min(1).max(80)`、无格式校验（[content.ts:229](../../../backend/src/routes/content.ts)），页面地址语义化且被 C1 地址白名单固定，不适合自动生成，归 C2/装修链 own
  - 审计 `diff.fields` 口径：产品链 `PATCH /products/drafts/:draftId` 只把**值真的变了**的列写进 `diff`，本链 `PATCH /articles/drafts/:id`（[:449-463](../../../backend/src/routes/content.ts)）仍把「本次提交的列」全量入 `diff`，整份表单回写时会出现 `名称 A → A` 这类未变项。两边都满足「记动作、操作人、时间与改动明细」，读数详略不同；`config.yaml` 的约定按产品链口径写，本链是否对齐由本链决定
  - 脏标记与富文本编辑器：产品链编辑页实测到 Tiptap 在挂载时会把存量 HTML 规范化重写一遍（`<li>` 补 `<p>`、属性换序），据此在「落过第一次真实交互之前」吸收这次回写。本链 `article/edit.vue` 用同一份快照比对（[:40-54](../../../buinessweb/src/views/admin/content/article/edit.vue)）且**没有**这层吸收，属防护缺口的差异而非已观测到的故障：实测 012 种子行（`?draft=13`）打开后不出现脏标记，因其存量正文已是 ProseMirror 规范化形态；一旦某行正文是非规范化写法（迁移直接写入、或编辑器版本演进），本链会在打开即显示「有未保存的编辑」。是否补同款吸收由本链决定
- 与 `decoration-editor-toolkit` 划界：装修区块的标题/描述/按钮文案仍是单行输入，正文级富文本只在资讯编辑页出现，两处不共用编辑器实现
- 与 `page-publication-approval` 划界：C2 只管 `pages` 表的双 JSON 列范式，本 change 的双表不动它、也不要求它跟着拆表；两处的「未发布不可见」由各自的结构保证，语义同构、实现不同

## Risks / Trade-offs

- [新增 4 个编辑器包与后端清洗白名单不一致，出现「编辑器里好看、存进去失真」] → 按 D9 裁剪清单与 `lib.ts` 的 `SANITIZE_OPTS` 逐条对照，不装靠 `style`/`class` 生效的扩展；验收含「保存 → 重新打开编辑器 → 与官网渲染三者比对」
- [管理端 `PATCH /articles/:id` 消失、改为按草稿 id 读写，调用方按旧签名发请求] → 这是 **BREAKING**，在 proposal 标注；`api/cms.ts` 的方法名分别带 `draft`/`article` 前缀，让「这个 id 是哪张表的」在调用点就能看出来，旧签名不留兼容别名
- [搬运清单漏列，某字段搬过去丢了；或把 `uid` 交给列默认值，历史断线] → 下线与发布都用显式列对列的 `INSERT … SELECT`，`uid`/`view_count`/`published_at`/`created_*`/`updated_by` 逐一写出，MUST NOT 让 `gen_random_uuid()` 默认值在搬运时生成新身份（一条内容换身份 = 审计历史与前次计数都接不上）；`uid` 在两表各 `UNIQUE`，反向搬运若写成「插新行 + 删旧行」也不会悄悄造出重复身份。清单同时写进迁移注释与 spec 场景，正向断言「改了必上线」，反向断言「下线再上线后浏览量与创建时间与修改历史都延续」
- [搬运不是原子的：插了草稿行却删掉发布行失败，或反过来，一线上出现两条同内容] → 下线与发布各自包在单事务里，`uid` 在两表的 `UNIQUE` 让「同一条内容在两表都有行」最多停留到事务结束即被违反约束回滚；不写「先删后插」的中间态
- [双 id 混淆：界面把在线行 id 传给编辑或删除，动作落到不该动的条目上] → 一行只有一个 id 与一个 `origin`，按钮形态**只由 `origin` 与 `state` 渲染**：在线行只给「查看」「下线」，草稿/已下线行给「编辑 / 发布 / 删除」；在线行根本没有「编辑」入口。两表主键各自递增，`drafts/7` 与 `articles/7` 可以同时存在，所以写请求 MUST 同时带上 `uid`，服务端校验「行 id 与 uid 指向同一行」，不符即拒绝——把「传错 id」从静默改到别的内容降级为一次报错。测试用例覆盖「数字相同但来自另一张表的 id 互不命中」
- [`DELETE /articles/:id` 保留在代码里但界面不用，被误当成公开能力调用] → 只挂 `content:write` 之外的更高权限并在 README、spec 与运维文档同时标注「不对外使用」；界面不渲染任何指向它的按钮，管理列表也不显示「删除线上」；测试用例覆盖「在线 id 调 `DELETE /articles/drafts/:id` 必须失败」
- [`audit_logs.entity_id` 的语义在资讯上从「行 id」变成「`uid`」，同一张表里混着两种口径的历史行] → 只影响资讯这一个 `entity_type`，按 `entity_type='article'` 过滤即自洽；012 之前的历史行（记的是行 id）不回填也不与 `uid` 混查，界面在时间线顶部注明「修改记录自本次修订起」。`diff` 此前从未被任何写入路径填过，资讯侧是第一个使用者，字段形态（`{fields, from, to}`）写进 D13 而不留各自发挥
- [管理列表要并两表两状态，排序与分页容易写出重复行或漏行] → 列表取数集中在一个查询函数：`articles`（`status=1`）与 `article_drafts`（`state` 0/2）做 `UNION ALL` 后统一 `ORDER BY` 分页，两表的 `id` 空间不重叠（各自 `BIGSERIAL`）但仍带上表名作为行的来源标记；一条条目只出一行，验收含「分页重复/遗漏」与「三态筛选各只出自己那批」两条
- [下线靠删发布行实现，`ON DELETE CASCADE` 连带清空 `article_view_dedupe`，24 小时判重窗口被重置] → 明确写进 D6 作为既成后果：一次「下线—再上线」循环最多让同一访客多计一次，展示口径不受影响；审计历史按 `uid` 聚合，不依赖明细表，因此不留缺口
- [线上内容不可编辑后，运营想「小改一个字」却要先把内容下线，官网会出现空窗] → 界面在下线确认里点名后果（「下线后官网立即 404，改完需再发布才恢复」），并提供「发布」作为下线后的唯一回归路径；这是本次修订接受的代价——用一段可预期的空窗换「线上内容永不被半成品覆盖」。被否决的替代是「改完不立刻撤下、留一份副本」，已在 D10 的否决清单里
- [收窄 `articles.status` 的 `CHECK` 是破坏性 DDL，别的环境若真有 `status=0` 或 `status=2` 行会失败] → 011 的第 2 步先搬后改，搬移动作与 `DROP CONSTRAINT` 同事务；012 的第 3、5 步把 `status=2` 行回收进草稿表后才把 `CHECK` 收到 `(1)`，回收与收窄同事务、同 `slug` 冲突则整笔中止并输出清单；两个反向脚本各自恢复上一档约束（`(0,1,2)` / `(1,2)`），本地库执行前只有 1 条 `status=1` 遗留行、无 `status=2` 行，这两步在项目内是空操作但仍要写出来
- [详情分类名与推荐标签下发依赖 join，分类被删后为 null] → 前端按空值隐藏标识，不回落写死文案；删除保护已让有引用的分类删不掉
- [关掉 `max-age` 后公开接口 QPS 上升] → 用协商缓存保留 304，响应体不重复传输；本项目为官网展示站，量级可承受
- [浏览去重明细表随流量增长] → 同一迁移脚本内按周清理的可重复 `DELETE`；上线初期量级下无压力
- [剥除站外图片让运营以为图片丢失是故障] → 保存响应回传剥除数量并就地提示，正文其余内容不丢
- [两个链都动 `router/index.ts` 与 `public.ts`] → 记录归属边界见 D2；`public.ts` 的缓存钩子按「处理器显式设头即豁免」的现有机制，资讯分支归本 change、产品分支归产品链，互不覆盖
- [富文本包带来体积与安装风险（内网不可达）] → 装包前先核对 4 个包及其传递依赖能否从现有 registry 取得，产物体积在安装前后各测一次并记进验收清单；不引入任何在线资源引用

## Migration Plan

**执行顺序有硬依赖**：数据迁移必须先落地，新的按草稿 id 读写的端点与只查发布表的公开接口才跑得起来；后端契约必须与前端调用同批发布，因为管理端点签名是破坏性改动。

**第 1～9 步已在 2026-10-29 按当时的「副本 + 下线是状态」口径执行完毕**（94/94 走查、`openspec validate --all --strict` 通过），下面的条目保留为执行记录，其中被本次修订撤销的部分在括号里点名；**第 10～13 步是 2026-10-30 修订的新增工作**，按序执行。

1. 数据：执行 `011_article_flow.sql`（建 `article_drafts` + 存量草稿搬离发布表并收窄 `CHECK` + `article_view_dedupe` 带级联 + 2 分类 4 条目种子 + 按周清理），同步 `backend/sql/schema.sql` 基线；核对四形态种子各一行、`articles.status` 只剩 1/2（种子与 `published_id`、`status=2` 的形态由第 10 步改写）
2. 后端草稿侧契约：新增 `POST /articles/drafts`、`PATCH /articles/drafts/:draftId`、`DELETE /articles/drafts/:draftId`、`POST /articles/drafts/:draftId/publish` 与幂等的「确保副本行」入口（该入口由第 11 步删除）；`assertSlugFree` 扩为跨两表；正文下限与站外图片剥除落在草稿写入路径；状态文案常量（`backend/src/routes/content.ts`）
3. 后端线上侧契约：`POST /articles/:id/unpublish`、`DELETE /articles/:id` 按发布 id（两者的语义由第 11 步改为「整行搬运」与「不对外使用」）；管理列表改一行两 id 的联合查询并回传 `has_unpublished_changes`（由第 11 步换成两表并集、去掉该字段）；分类删除引用计数跨两表
4. 后端下发契约：`/public/articles/:slug` 补分类名、相关推荐补分类名与 `tags`、`/public/search` 资讯分支补分类名 join、资讯公开接口改协商缓存、GET 详情去掉写操作、新增 `POST /public/articles/:slug/view` 判重（`backend/src/routes/public.ts`）——本步不受修订影响，公开接口一直只读发布表
5. 前端目录：`git mv` 成两个目录，`components/` 预留给正文编辑器，修 `router/index.ts` 的 import，`vue-tsc` 通过——不受修订影响
6. 富文本接入：装 4 个包，`RichBodyEditor.vue` 按 D9 清单配扩展与工具栏，图片走 `MediaPicker`，产物体积对比记录——不受修订影响
7. 管理端资讯：`api/cms.ts` 与 `types/cms.ts` 改双 id 方法签名、列表分页与「未发布改动」标记、称谓订正、标识可改与唯一提示、编辑页拆「保存改动」与「发布」两动作及放弃改动、重开编辑页读副本、空正文前后端一致、分类引用数（双 id 方法签名、未发布改动标记、「保存改动/放弃改动」两动作、编辑页读副本四点由第 12 步撤销；称谓订正、标识可改与唯一提示、空正文一致、分类引用数四点保留）—— **其中「标识可改与唯一提示」自 2026-11-02 起反向调整**：标识由服务端生成且冻结、界面只读回显，唯一提示与就地校验一并撤除（见 D3 与第 13 组）
8. 官网新闻资讯：去写死区头与全部 5 处 `'NEWS'` 兜底、正文样式覆盖清单、元信息含浏览量、显式上报、三层状态、筛选与分页落地址、地址指向 `/article/:slug`（与 C1 第 3/4 组同批）——不受修订影响
9. 验证：`tsc`/`vue-tsc`、`article-content-flow` 场景走查（撰稿→保存→重开仍是我的内容且线上不变→发布→线上一次到位→再编辑→放弃改动→下线→404→已下线不可直接编辑→计数有界增长且发布不清零）——按第 13 步的新场景重跑一遍
10. 修订的数据：执行 `012_article_online_readonly.sql`（两表加 `uid` + `updated_by`、草稿表加 `state`，灌 `updated_by=created_by`，回收 `articles.status=2` 行进草稿表并置 `state=2`，降级现存副本行并 `DROP COLUMN published_id`，`articles` 的 `CHECK` 收到 `(1)`，重排三形态种子），同步 `backend/sql/schema.sql`；核对发布表只剩 `status=1`、`uid` 在两表各无重复、被回收行的 `view_count` 与 `published_at` 随行到达草稿表
11. 后端按新模型改契约：`POST /articles/:id/unpublish` 改为「整行搬运进草稿表 + `state=2`、删发布行、同事务」；`POST /articles/drafts/:draftId/publish` 改为「整行搬运进发布表、`status=1`、首次发布写 `published_at`、`uid` 原样带过去」；删除 `POST /articles/:id/revision` 与列表的 `has_unpublished_changes`；`DELETE /articles/:id` 保留但标注不对外使用；`GET /articles` 换两表并集、回传 `uid`/`origin`/`state`/`updated_by` 姓名；写请求统一带 `uid` 做「行 id 与内容身份相符」的校验；`ARTICLE_STATE_TEXT.published` 的文案由「已发布」改为「已上线」（键名与类型不动）；两表的每个写路径刷新 `updated_by` 并把 `diff` 写进 `audit_logs`（`entity_type='article'`、`entity_id=uid`）；`GET /audit` 加 `entityUid` 精确过滤（`backend/src/routes/content.ts` 的资讯段与审计段）
12. 前端按新模型改界面：`types/cms.ts` 的 `ArticleAdminRow` 去 `published_id`/`draft_id`/`has_unpublished_changes`，改单一 `id` + `origin` + `state` + `uid` + `updated_by`/`updated_by_name` + `updated_at`；`ArticleEditable` 去 `source`/`online_slug`（不再有「读哪一份」的问题）；`api/cms.ts` 删 `ensureRevision`、写方法统一带 `uid`；列表按钮形态改为「在线行只有查看与下线，草稿/已下线行有编辑/发布/删除」，新增「修改人 / 修改时间」两列与「修改记录」时间线（调 `GET /audit?entityUid=`）；编辑页把「保存改动」改回「保存」、撤除「放弃改动回到线上内容」，头部显示「最后由 X 于 T 修改」，在线条目进入编辑页前先提示「需先下线」（`buinessweb/src/views/admin/content/article/`）
13. 验证与文档：`tsc`/`vue-tsc`；新场景走查（撰稿→保存→发布→线上一次到位→**在线行尝试编辑/删除必须被拒**→下线→官网 404 且内容在草稿表 `state=2` 仍在→编辑→再发布→计数与创建时间延续、修改记录串到同一 `uid`→删除只作用于草稿行）；`docs/service-design/01-frontend-buinessweb-design.md` §9.2/§9.3 的状态机与搬运列重写为三形态双表，`README.md` 与 `proposal.md` 的「四形态/副本」措辞同步

回滚：前端目录重组、富文本接入、双表读写、下发契约各自独立提交，可单独 `git revert`（回退富文本后正文仍是清洗过的 HTML，编辑器只是退回文本域）。数据侧分两段：**回退本次修订**执行 `012_article_online_readonly.rollback.sql`（把 `state=2` 行搬回发布表置 `status=2`、恢复 `CHECK (1,2)`、`ADD COLUMN published_id`——旧副本关系无法恢复，是本迁移唯一不可逆的一列——再 `DROP COLUMN state`/`updated_by`/`uid`），随后后端要同时退回 011 那版契约，否则「副本行」相关的端点与字段都会落空；**回退整条链**才执行 011 反向脚本（删种子与分类、`DROP TABLE article_drafts`、`DROP TABLE article_view_dedupe`、恢复 `CHECK (0,1,2)` 并把草稿行搬回发布表）。**回退后端但保留双表数据是安全的**——发布表内容从未被编辑动作改过，官网读到的仍是已发布内容；反过来若只回退迁移而保留后端，按草稿 id 的端点会因表不存在而失败，故迁移回退必须与后端回退同批。缓存头回退即恢复 `max-age`，不动数据。审计里的 `diff` 与新写的 `entity_id=uid` 一旦落库不回滚（`audit_logs` 是只增不改的运维记录），回退后 `GET /audit` 的 `entityUid` 参数留着不影响旧调用。

## Open Questions

- 「小改一个字也要先下线」会产生官网空窗。是否需要「把在线条目复制成一条新草稿」的入口，让运营先在草稿里备好转修版、再一次完成下线与发布（本修订明确不做：两条同内容并存就是上一版「线上 + 副本」的回潮，且复制出来的草稿与线上行 `slug` 冲突要先改名）；若要接受，代价是放弃「一条只存在于一张表」这条结构不变量
- 已下线（`state=2`）与新建草稿（`state=0`）同表同列，列表当前只靠状态筛选区分。是否需要默认分组（如「未上线」与「已下线」两段），还是保持一张表一条列表
- `DELETE /articles/:id` 保留但不对外使用：只靠「界面不渲染」是否够，还是要给它一个独立的权限位（现有 `content:write` 已覆盖它，任何能写内容的角色直接调接口都能删线上行）
- `updated_by` 只表达最后一人。列表是否需要「本条被改过 N 次」这类聚合列（数据在 `audit_logs`，按 `uid` 聚合可得，但要为每行发一次子查询）
- 「修改记录」时间线放管理列表行内展开，还是放编辑页侧栏（改动史对一个已经进草稿表待编辑的行最有用，但界面入口只有这两处）
- 正式资讯封面与正文配图由谁提供、走素材库上传还是沿用 `public/website/img/` 内置资产（本 change 先用内置资产占位）
- 浏览去重窗口取 24 小时是否合适（另一个常见口径是 7 天，取决于是否把回访算作新浏览）；下线会重置该窗口，是否需要在重置时留一条审计记录
- 正文是否需要「表格」这一能力（当前按 D9 不装，因为列宽属性会被清洗；若必须有表格，要先放宽 `sanitize-html` 的 `col`/`td` 属性白名单）
- 站外图片剥除后是否要保留一行提示文案告知运营原文有图被移除（当前只回传数量）
- 资讯是否需要「置顶/推荐」这类排序权重（当前只按发布时间倒序）

## 已知缺口（2026-11-02 核查登记 → **同日随标识自动生成方案落地关闭**）

**以下为改造前的实况记录，保留作登记依据；现行口径见 D3 与 `tasks.md` 第 13 组。** 本链 spec 第 9 行写「标识格式要求与产品一致」，但实现未跟上；产品链 `product-content-flow/tasks.md` 9.3 已把这条不对称登记为「资讯侧的补齐留给资讯链，本链不代改其行为」。本链收尾时未补，故在此挂起，待资讯链下一轮统一处理（届时同步补 spec 场景）。三条缺口：

1. **资讯内容标识缺格式校验**：`backend/src/routes/content.ts` 的 `draftCreateSchema.slug` 只有 `min(1).max(100)`，无 regex。实测 `POST /articles/drafts {"slug":"Bad-Slug"}` 返回 `code:0` 并成功建行（样本行已清理），会产出 `/article/Bad-Slug` 这类地址；产品侧同入口返回 1001「标识只能由小写字母、数字与连字符组成」。补齐口径：加 `.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)` 与同款中文提示。
2. **本链 spec 缺独立场景**：产品 spec 有「Scenario: 标识格式非法」，本链 spec 只有「标识重复被拒」「与线上内容的标识冲突」「已下线条目改标识」三个场景，没有格式非法场景，导致这条要求在产品链可验收、在本链不可验收。
3. **资讯分类标识无任何校验**：`content.ts` 资讯分类段的 `slug: z.string()` 连长度都没有；产品分类用的是 `categorySlugSchema`（`min(1).max(100)` + 同一 regex）。补齐时一并对齐。

补齐前需先查库里是否已有不合格式的存量标识（只报告、不自动改写——改标识即改官网地址，须运营确认）；本链双表两处 `slug` 都要覆盖。

**2026-11-02 后续：需求方确认改「标识由后端在保存时自动生成」（方案 `docs/标识自动生成方案.md`），同日已按 D3 落地。** 本组三条缺口的处置结论：

- 缺口 1（内容标识缺 regex）与缺口 3（分类标识无校验）→ **消解**：不再有人工输入，生成值必合规，格式问题无从产生。两条写入 schema 与分类 schema 里的 `slug` 字段已删除。
- 缺口 2（本链 spec 缺格式非法场景）→ **已改写**：spec 里的「标识重复被拒」「与线上内容的标识冲突在保存时就被拒」「已下线条目改标识要重新发布才生效」三条场景换为生成侧的三条（不重复 / 不接受外部提交 / 生成不出来就失败不静默改名），并新增独立 Requirement「标识一经生成即冻结，改名不影响官网地址」（5 个场景）；产品侧同场景同步处理。
- **存量检查已执行**（7 张表全量盘点）：仅 `articles` id=7 的 slug 为 `大法师的`（纯中文、`status=1` 已上线，官网地址 `/article/大法师的`），其余 6 张表（products / product_drafts / article_drafts / product_categories / article_categories / pages）全部合规。**处置：不改写**——本轮不迁移存量，该地址继续有效（**2026-11-03 实测：`GET /api/public/articles/大法师的` 返回 200**，线上表 5 条存量资讯按原标识逐个可访问，无一条因改造失效）。（改造后前端不再对手工标识做格式校验，也不提供改入口）。若日后要换码，须运营确认并同步处理外部物料。
- **改造后新增的不对称点**：装修页 `pages` 的 slug（[content.ts:229](../../../backend/src/routes/content.ts)，仅 `min(1).max(80)`、无格式校验，配合 [:207-211](../../../backend/src/routes/content.ts) 的 `assertSlugFree('pages', …)`）仍为手工填写；页面地址语义化且被 C1 地址白名单固定，不适合自动生成，故保留手工——它是改造完成后唯一的「手工 + 无校验」残留点，已在两链的修订清单各自登记，归 C2/装修链 own。
