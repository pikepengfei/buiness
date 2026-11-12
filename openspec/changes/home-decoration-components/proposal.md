## Why

首页当前的 9 个内容段（`buinessweb/src/website/pageDefaults.ts:11-101`）与颜色带天然一一对应，但每一段都是一个「版式焊死」的整块组件：文字、图片、按钮三种最小元素在 5 个区块里各写一遍（`class="btn"` 共 7 处、`<img>` 共 5 处），同一个按钮在不同模块的间距与态样式靠手抄维持，运营要调整一段内容的排布只能改组件源码。

已经有一个事实上的原子件存在于仓库里——`SecHead.vue`（眉标+主标题+描述三件套）被 14 个区块复用，证明这条路线可行，只是它的形态不对：放在 `sections/` 里、只覆盖标题、没有进注册表、运营无法单独插入或调整它。

本 change 做三件事：把首页按颜色变化切成 9 个可独立装修的模块；在 `src/components/ui/` 建公共组件文件夹，落地文字/图片/按钮三类基础元素；让模块组件改为调用这些基础元素，同时基础元素与模块一起进管理端组件库面板。

## What Changes

- 新增前端公共组件目录 `buinessweb/src/components/ui/`，落地三类基础元素共 5 个组件：文字（`UiText` 段落 + `UiHeading` 眉标/标题/描述）、图片（`UiImage`）、按钮（`UiButton` 实心/幽灵/浅色幽灵三态）。全部自带 scoped 样式、只消费 `website.css` 既有 CSS 变量，不改全局 tokens。
- 首页 9 个模块（首屏/品牌介绍/使命愿景/价值观/精选产品/品牌背景/产品矩阵入口/最新资讯/尾部 CTA）逐一登记为可独立装修的模块，模块内部改为调用上述基础元素，删除各区块自写的按钮与图片标签。
- `SecHead.vue` 迁为 `UiHeading` 的实现基座并保留原路径的兼容引用（14 处调用点不改语义）。
- 组件库面板：管理端装修编辑器新增「组件库」入口，分 **模块** 与 **基础元素** 两层，点击即可插入到当前选中位置；沿用现有点击式添加（`editor.vue:299-308`），本 change 不做拖拽。
- **BREAKING** 内容结构模型从一维列表变为可嵌套树：区块新增「子节点序列」，区块结构版本从 1 升到 2。老页面读取时自动向前兼容，无需重新保存；但**旧版渲染器读取新树会把容器渲染成空壳**，因此上线顺序被硬性约束为「先部署递归渲染，再允许编辑器产出嵌套结构」。
- 后端区块结构校验从扁平改递归，补深度与总节点数上限；`props` 内容由注册表定义、后端不校验这一既有分工不变。
- 不改动：页面双版本（草稿/正式）、发布原子切换、审核与版本快照、素材库上传链路、`website.css` 的全局版式规则与 CSS tokens、导航路由白名单。
- 明确排除：像素级自由定位与内联样式编辑、具名多插槽、第三方低代码引擎（TinyEngine / LowCodeEngine / GrapesJS）、区块拖拽与模板库（归 `decoration-editor-toolkit`）、撤销重做栈。

## Capabilities

### New Capabilities

- `home-module-components`: 首页模块划分规则、基础元素全站同构、组件库两层浏览与插入、嵌套结构的深度与数量约束、改造前页面的兼容读取、三态可见性与权限拒绝。

### Modified Capabilities

（无——本 change 不修改 `block-decoration`（属 `decoration-editor-toolkit`，未落地）、`page-routing`、`site-navigation`、`page-publication` 的任何既有要求；`pages.content_json` 的顶层形状仍是 `{ blocks: [...] }`，只是元素内部多出可选的子节点序列。）

## Impact

- 前端新增：`buinessweb/src/components/ui/{UiText,UiHeading,UiImage,UiButton}.vue`、`buinessweb/src/components/ui/index.ts`（统一出口）、`buinessweb/src/views/admin/website/components/ComponentLibraryPanel.vue`
- 前端改动：`buinessweb/src/website/blocks.ts`（子节点类型与迁移阶梯 v1→v2、深度/数量裁剪）、`buinessweb/src/website/SectionRenderer.vue`（递归分发与逐层过滤）、`buinessweb/src/website/sectionRegistry.ts`（新增 `layer`/`accepts`/`allowedIn` 元信息与基础元素注册项，`SECTION_GROUPS` 增「基础元素」「首页模块」两段）、`buinessweb/src/website/sections/{SecHero,SecCtaBanner,SecPmEntry,SecProductGrid,SecNewsFeed,SecFeatureProducts,SecStory,SecPosterGrid}.vue`（改调基础元素）、`buinessweb/src/website/pageDefaults.ts`（home 九段的模块登记与结构对齐）、`buinessweb/src/views/admin/website/pages/editor.vue`（组件库入口与插入约束校验）
- 后端改动：`backend/src/routes/content.ts:27-34`（`blocksSchema` 改递归 + `maxDepth`/`maxNodes`，错误路径保持 `blocks.2.children.0.type` 形式）
- 数据：新增 `backend/sql/migrations/013_home_module_seed.sql` + `013_home_module_seed.rollback.sql`（把 home 页种子 blocks 与新的模块划分对齐；仅当现内容为默认结构时重写，不动运营已编辑的内容）；同步 `backend/sql/schema.sql` 无表结构变更（本 change 不改任何表 DDL，JSONB 整份覆盖即可承载树形）
- 文档（逐文件点名，避免再次失同步）：`docs/service-design/02-官网低代码装修平台设计与实施文档.md`（§1.2「结构固定」表述与 §3 区块体系需补基础元素与嵌套两层）、`docs/数据结构文档.md`（区块树与深度上限）、`docs/接口文档.md`（递归校验与错误路径）、`docs/前端执行文档.md`、`docs/后端执行文档.md`、`openspec/config.yaml`（内容模型那条描述由 `{blocks:[{id,type,visible,props}]}` 改为含可选子节点序列）
- 依赖：无新增 npm 依赖（符合仓库约定）
- 关系：排在 `decoration-editor-toolkit` 之前还是之后见 design D8；与 `site-runtime-link-integrity`（取消内置回落）必须同期或先行，见 D7
