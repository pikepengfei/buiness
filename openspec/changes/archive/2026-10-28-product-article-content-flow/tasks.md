## 1. 后端：内容契约收紧

- [ ] 1.1 `POST`/`PATCH` 的标识校验抽出复用：格式规则（小写字母数字与连字符、长度上限）+ 唯一性，`assertSlugFree`（[content.ts:85](../../../backend/src/routes/content.ts)）改为返回可读错误并统一错误码
- [ ] 1.2 `PATCH /products/:id` 与 `PATCH /articles/:id` 的字段映射补入 `slug`，走与创建相同的唯一校验与事务；并发冲突转 409 中文提示，不抛 500
- [ ] 1.3 `products.specs` 收紧为 `{label,value}[]`（≤20 项）、`highlights`（≤8）、`gallery`（≤8），畸形结构与非数组在写入前拒绝（替换 `specs: z.any()`，[content.ts:340](../../../backend/src/routes/content.ts)）
- [ ] 1.4 产品补 `POST /products/:id/publish` 与 `/unpublish`（对齐资讯的动作语义与审计记录），保留 `PATCH {status}` 兼容既有调用
- [ ] 1.5 分类删除引用保护：`DELETE /{product,article}-categories/:id` 前统计引用（含草稿与已下线），非 0 返回 409 与占用数量；外键 `ON DELETE SET NULL` 保持不变
- [ ] 1.6 浏览计数从 `GET /public/articles/:slug` 中移出（删除 [public.ts:126](../../../backend/src/routes/public.ts) 的写操作），新增 `POST /public/articles/:slug/view`：按「条目 + 访客指纹（IP 哈希 + UA 摘要）+ 24 小时窗口」判重，命中不计数
- [ ] 1.7 `GET /products/:id`、`GET /articles/:id` 返回渲染详情所需的全部字段；确认前端 `normalizeSpecs` 之类的读取兜形可移除
- [ ] 1.8 状态文案在服务端单一来源（产品 上架/下架，资讯 草稿/已发布/已下线），接口错误提示引用同一常量
- [ ] 1.9 `PATCH /articles/:id` 按状态分岔：`status` 为草稿/已下线时照旧写正式列，为已发布时只把改动写入 `draft_json`、正式列一字不动（`draft_json` 存差量，字段清单固定为 正文/标题/摘要/封面/分类/标签/作者/标识）
- [ ] 1.10 `POST /articles/:id/publish` 改在一个事务内完成：读 `draft_json` → 正文按 `sanitize` 清洗 → 覆盖正式列 → `draft_json = NULL` → `status = 1`、`published_at = COALESCE(published_at, NOW())`；无草稿时只改状态，重复执行结果一致；清洗后正文为空则 400 拒绝且线上与草稿都不变
- [ ] 1.11 新增放弃未发布改动的入口（`POST /articles/:id/discard-draft`），只清 `draft_json`，不改状态与正式列
- [ ] 1.12 `GET /articles/:id` 与列表返回「是否存在未发布改动」的派生标记，供管理端显示；接口向后兼容（只增字段）
- [ ] 1.13 backend `npx tsc --noEmit` 通过

## 2. 数据迁移 010

- [ ] 2.1 新增 `backend/sql/migrations/010_content_flow.sql`：`products.specs` 列默认 `'{}'::jsonb` → `'[]'::jsonb`，并把存量 `{}` 行归一为 `[]`（幂等，重复执行结果一致）
- [ ] 2.2 迁移内统计现有 `specs`/`highlights`/`gallery` 数组长度超过上限的行并输出清单（不自动截断），供运营确认
- [ ] 2.3 建 `article_view_dedupe(article_id, visitor_key, seen_at)` 与 `(article_id, visitor_key, seen_at)` 索引，附按周清理的 `DELETE`（可重复执行）
- [ ] 2.4 `ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_json JSONB`：可空，`NULL` 表示无未发布改动；只存差量字段，不参与任何查询索引
- [ ] 2.5 幂等种入：产品分类 2 个、资讯分类 2 个、产品 3 条（含规格/卖点/图集/购买链接各一条完整 + 一条仅封面 + 一条字段缺项）、资讯 3 条（含正文带图与列表、一条无作者无分类、一条 `status=2` 用于验证下线不可见）
- [ ] 2.6 种子行的 `title`/`summary` 冠以「示例」字样并在 SQL 注释写明「用于链路验收，正式素材由运营替换」，图片引用现有 `public/website/img/prod/*.png`；种入的资讯正文只使用 D10 能力边界内的标签与属性，保证「编辑器产出 = 清洗后保留」
- [ ] 2.7 附反向脚本：删除种子行、删除 `article_view_dedupe`、`DROP COLUMN draft_json`、`specs` 默认值回 `'{}'`；注释标明与正向脚本的执行顺序
- [ ] 2.8 同步 `backend/sql/schema.sql`：`specs` 默认值、`article_view_dedupe` 表定义、`articles.draft_json` 列与注释（图集列注释「object_key 数组」订正为「可直接渲染的图片地址」）
- [ ] 2.9 本地执行方式确认（无 `psql`：node + `pg` 跑脚本），执行后核对：产品 3 条上架 2 条、资讯 3 条发布 1 条下线 1 条、`specs` 无 `{}` 残留、`draft_json` 全为 `NULL`

## 3. 前端：四个功能目录落地

- [ ] 3.1 `git mv` 建立 `views/admin/content/product/{index,edit,categories}.vue`（原 `products.vue`、`product-edit.vue`、`product-categories.vue`）
- [ ] 3.2 `git mv` 建立 `views/admin/content/article/{index,edit,categories}.vue`（原 `articles.vue`、`article-edit.vue`、`article-categories.vue`），`article/components/` 预留给第 5 组的正文编辑器
- [ ] 3.3 `git mv` 建立 `views/website/products/{index,detail}.vue`（原 `Products.vue`、`ProductDetail.vue`）与 `views/website/news/{index,detail}.vue`（原 `News.vue`、`Article.vue`）
- [ ] 3.4 从 `product-edit.vue` 拆出 `product/components/{GalleryEditor,SpecsEditor}.vue`，编辑页只保留表单编排与提交
- [ ] 3.5 `router/index.ts` 仅改 import 路径，`path`/`name`/`meta` 一字不动；核对管理端首叶 `/admin/content` 解析规则与 `meta.activeMenu` 高亮未被破坏（`stores/adminMenu.ts:8-10`）
- [ ] 3.6 全站检查对被移动组件的引用（`MediaPicker`、`SectionRenderer` 等共用件保持原路径引用，产品目录与资讯目录之间零相互 import）
- [ ] 3.7 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过，后台侧栏四个入口逐条点击回归

## 4. 管理端产品功能

- [ ] 4.1 列表补齐：发布时间/创建时间列、每页条数选择、行内「上架/下架」改走专用端点并二次确认，操作成功后按服务端结果刷新而非乐观翻转
- [ ] 4.2 编辑页新建/编辑态标题、按钮文案与返回路径统一（返回一律 `/admin/content`，与资讯侧对齐）
- [ ] 4.3 标识字段：编辑态可修改并显示当前官网地址；提交时唯一性冲突就地提示；改标识触发后果确认弹窗
- [ ] 4.4 `GalleryEditor`：上限 8、可删除、可上下移动调整顺序、空位不提交空字符串
- [ ] 4.5 `SpecsEditor`：上限 20、行序即展示序、参数名必填校验，提交形态与后端 `{label,value}[]` 一致
- [ ] 4.6 `types/cms.ts` 的 `ProductAdminRow.specs` 由 `any` 收敛为 `{label,value}[]`，`api/cms.ts` 补产品发布/下线方法并替换列表页的裸 PATCH
- [ ] 4.7 分类维护页只读展示当前引用数量；删除被引用分类时显示服务端返回的占用数量提示
- [ ] 4.8 backend 与 buinessweb 类型检查通过；走查 `product-content-flow` 的录入、标识、形态三项要求的失败路径场景

## 5. 管理端资讯功能

- [ ] 5.1 列表分页控件与产品对齐（补每页条数选择），筛选三态文案取自统一状态常量；列表加「未发布改动」标记列（取自 1.12 的派生字段）
- [ ] 5.2 编辑页状态下拉的「已下架」改为「已下线」，与列表称谓一致；新建默认草稿且不写发布时间
- [ ] 5.3 标识字段同 4.3（可修改、唯一校验、后果确认）
- [ ] 5.4 安装富文本依赖：`@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-image`、`@tiptap/extension-placeholder`（实测 3.32.0），核对新增传递依赖、确认无任何在线资源引用（内网不可达约束）；`vite build` 产物体积与安装前对比记录进验收清单
- [ ] 5.5 新建 `article/components/RichBodyEditor.vue`：按 D10 清单装配扩展——`Heading` 限 `h2/h3/h4`，链接带 `target=_blank` + `rel=noopener noreferrer`，**不装** `TextAlign`/`TextStyle`/`Color`/`Highlight`/`Indent`/`Table`；工具栏用 Element Plus 按钮 + `@element-plus/icons-vue` 图标自绘，不引入编辑器自带样式表
- [ ] 5.6 正文图片插入调用共用 `MediaPicker`（只取其回传地址），不新增上传入口、不放行编辑器直传；粘贴内容由 schema 自动过滤，编辑器不做 Word 保真解析
- [ ] 5.7 编辑页把「保存」与「发布」拆成两个动作：保存走 `PATCH`（草稿/已下线写正式列，已发布只写草稿），发布走专用端点；已发布且存在未发布改动时在页顶显示标记与「放弃改动」，返回列表的入口与产品侧对齐
- [ ] 5.8 正文为空的判定前后端一致：`<p></p>`、纯空白视为空并在发布前就地提示（服务端同样拒绝）
- [ ] 5.9 `types/cms.ts` 与 `api/cms.ts`：资讯行补「是否存在未发布改动」字段，`articles.update` 的方法注释点名「已发布内容只写草稿、不触线上」这一语义分岔（对既有调用方是破坏性变更）
- [ ] 5.10 标签输入保留回车新增并去重；分类维护页同 4.7（引用数量展示与删除被拒提示），`types/cms.ts` 的 `ArticleCategory` 补 `sort` 字段
- [ ] 5.11 buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过
- [ ] 5.12 走查 `article-content-flow` 的富文本要求（撰稿、清洗、粘贴、格式入口、图片来源、标识重复、权限被拒）与草稿分离要求（编辑期间线上不变、发布覆盖、放弃改动、并发发布、空正文被拒、权限被拒）全部场景

## 6. 官网产品中心

- [ ] 6.1 `products/index.vue` 保持装修页结构（区块驱动）不变，列表区取数逻辑留在 `products/` 目录内
- [ ] 6.2 `SecProductGrid.vue` 的跳转地址统一到 `/option/product/:slug`，与 `site-runtime-link-integrity` 第 4 组同批改写
- [ ] 6.3 列表区状态分三层：装修页未发布 → 整页 404；已发布但 0 条 → 列表区空态 + 返回入口；请求失败 → 可重试错误态
- [ ] 6.4 筛选与分页参数落地址栏（分类、关键词、页码），分享同一地址得到同一结果；页码越界返回空列表且总数正确
- [ ] 6.5 `products/detail.vue` 移除写死的「产品详情 / 参数与卖点」区头，改为产品自身名称、系列与分类；面包屑上级「产品中心」
- [ ] 6.6 移除内置占位图回落（`cube-closeup.png`）：无图集时只显示封面，无封面时显示无图占位样式而非某个真实产品图
- [ ] 6.7 规格、卖点、相关产品、购买入口四处「无数据即不渲染」；外链 `rel="noopener noreferrer"`
- [ ] 6.8 详情的查无此条（品牌化 404）与取数失败（可重试错误态）分离，浏览器标题使用产品名称
- [ ] 6.9 走查 `product-content-flow` 的列表与详情要求全部场景（含种子中「仅封面」和「字段缺项」两条产品）

## 7. 官网新闻资讯

- [ ] 7.1 `news/index.vue` 保持装修页结构不变，`SecNewsFeed.vue` 与 `SecLatestNews.vue` 跳转统一到 `/option/article/:slug`
- [ ] 7.2 列表区同 6.3 的三层状态；排序按发布时间倒序，翻页不重复不遗漏
- [ ] 7.3 分类筛选与分页参数落地址栏，与产品侧使用同一套查询参数命名约定
- [ ] 7.4 `news/detail.vue` 移除写死的「新闻咨询 / 详情」区头与面包屑错别字，改为资讯标题与分类；面包屑上级「新闻资讯」
- [ ] 7.5 元信息区按存在的字段渲染（作者/分类/发布时间任缺其一不出现孤立分隔符）；正文图片宽度自适应
- [ ] 7.6 正文样式覆盖富文本能力集合内的全部标签（`h2`–`h4`、`p`、`ul/ol/li`、`blockquote`、`pre`/`code`、`hr`、`mark`、`a`、`img`），写在 `news/detail.vue` 的 scoped `:deep` 里；不为清洗后不存在的 `style`/`class` 写选择器，样式与编辑器预览观感一致
- [ ] 7.7 浏览计数改为进入详情时调用显式上报端点，失败静默不影响阅读；同会话重复刷新不持续累加
- [ ] 7.8 浏览器标题使用资讯标题，返回列表后恢复列表页标题；走查 `article-content-flow` 的列表、详情、计数三组场景（含种子里的已下线资讯）

## 8. 修订既有 change 与文档

- [x] 8.1 `site-runtime-link-integrity/design.md`：D2 由「合并为单一 `Option.vue`」改写为「统一路由 + 两目录各自实现」，并写明否决理由
- [x] 8.2 `site-runtime-link-integrity/tasks.md` 第 3 组：3.1（`Option.vue`）、3.5（抽共用骨架）、3.9（删除两个旧组件）改为按目录拆分详情的表述；第 4 组引用改写目标不变
- [x] 8.3 `site-runtime-link-integrity/specs/page-routing/spec.md`：「同一详情组件按类型取数」改为「同一地址形态按类型分别渲染」，其余地址规则不动
- [x] 8.4 迁移编号顺延：C1 `005_fixed_nav_rows.sql` → `007`，C2 `006_page_workflow.sql` → `008`，C3 `007_block_templates.sql` → `009`（逐处核对 12 处引用并同步各自 `schema.sql` 说明）
- [ ] 8.5 在 `docs/service-design/` 补「两条内容链与四个功能目录」一节：目录归属表、状态机图（产品两态 / 资讯三态）、`specs` 形态契约
- [x] 8.5 `openspec/config.yaml` 的「约定」增补一条：内容类功能按 `views` 下功能目录组织，产品与资讯不互相引用
- [x] 8.6 `openspec/config.yaml` 的「约定」登记富文本依赖例外：正文编辑器是「不轻易新增 npm 依赖」的有意例外，新增编辑器包须在 change 的 Impact 点名并说明否决零依赖方案的理由（本轮已写入，实施时不再新增其他编辑器包）
- [ ] 8.7 划清与 `decoration-editor-toolkit` 的边界：装修区块的标题/描述/按钮文案仍是单行输入，正文级富文本只在资讯编辑页出现，两处不共用编辑器实现
- [ ] 8.8 核对 `site-runtime-link-integrity` 与 `page-publication-approval` 不受草稿语义影响：C1 只管地址与状态可见性，C2 只管 `pages` 表；`/option/article/:slug` 的取数仍读正式列，草稿列永不下发
- [ ] 8.9 在 `docs/service-design/` 补「两条内容链与四个功能目录」一节：目录归属表、状态机图（产品两态 / 资讯三态 + 未发布改动）、`specs` 形态契约、富文本能力边界与清洗白名单对照表
- [x] 8.10 `openspec validate --all --strict` 四份 change 全部通过

## 9. 验证与回滚

- [ ] 9.1 端到端走查产品链：后台新建（含规格 3 项、卖点 2 条、图集 2 张）→ 上架 → 官网列表可见 → 详情字段逐项一致 → 下架 → 列表与搜索消失 → 直访详情为 404 → 重新上架恢复
- [ ] 9.2 端到端走查资讯链：草稿 → 官网不可见 → 发布（时间写入）→ 再次发布（时间不变）→ 下线（内容保留）→ 直访详情 404 → 浏览量在有界范围内增长
- [ ] 9.3 富文本三态一致走查：用工具栏逐种格式撰稿（`h2`–`h4`、加粗/斜体/下划线/删除线、行内代码、代码块、两个列表、引用、分隔线、链接、素材库图片）→ 保存 → 重新打开编辑器 → 官网详情渲染，三者逐项一致；粘贴一段带内联样式的外部内容后保存，确认样式与脚本被丢弃且文字与结构保留
- [ ] 9.4 草稿分离走查：改一篇已发布资讯的正文并保存 → 官网仍是旧内容且列表标记未发布改动 → 发布 → 官网一次到位且发布时间未变 → 再改 → 放弃改动 → 编辑器回到线上内容；两个账号同时发布同一篇，线上等于其中一次结果
- [ ] 9.5 标识变更验证：产品与资讯各改一次标识，旧地址 404、新地址内容正确，审计留痕可见；并发争抢同一标识只有一个成功
- [ ] 9.6 删除保护验证：删有引用的分类被拒并显示占用数量；删空分类成功且官网筛选同步
- [ ] 9.7 权限路径验证：仅 `content:read` 账号在两个功能界面无写入口，直接调用写接口（保存草稿、发布、放弃改动）被服务端拒绝
- [ ] 9.8 两端类型检查通过：backend `npx tsc --noEmit`，buinessweb `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`
- [ ] 9.9 执行 010 反向脚本再前向执行一次，确认种子与默认值恢复正确、`article_view_dedupe` 与 `articles.draft_json` 可重建
- [ ] 9.10 前端目录重组、富文本接入、草稿语义各自作为独立提交，确认可单独 `git revert` 而不影响后端契约改动
