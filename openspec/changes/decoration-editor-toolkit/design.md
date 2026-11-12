## Context

> **2026-11-10 衔接修订**：本 change 的行文原先建立在「左栏平铺区块列表 + 新增区块弹窗」的旧编辑器上。前置 change `component-library-standalone` 已交付「组件库右侧抽屉 + 三栏 + 递归结构树」，本文与 proposal / spec / tasks 已按当前代码重写；凡与抽屉化架构冲突的落点一律以本版为准。

装修器当前形态（`buinessweb/src/views/admin/website/pages/editor.vue`）：

- **三栏**：左「页面结构」递归树（`treeRows`，带 `depth` / `child` / 折叠 `expandedIds`）独占全高；中「内容编辑」（`BlockForm` 按 `formSchema` 渲染）；右「实时预览」（`SectionRenderer :preview`）
- **组件库**：左栏头部 `.ed-lib-open` 按钮打开，是挂在 `.ed-body` 内的右侧抽屉（`direction="rtl"` / `480px` / `append-to-body=false` / `modal=false` / `modal-penetrable=true`）；抽屉内容 `ComponentLibraryPanel.vue` 分「模块 / 基础元素」两段，卡片由 `LibraryGrid` → `LibraryCard` 真实渲染
- **选中态**：`selPath: number[]`（路径，不是 id），驱动 `BlockForm` 的 `:key`、`previewFolded`、`moduleTarget` / `atomTarget` 插入目标
- **组件库卡片**：`LibraryCard.vue` 的 `item` 为 `{type,label,group,reason?}`，渲染内容固定来自 `libraryDemoBlocks(type)`（注册表 `defaultProps()` 骨架），`IntersectionObserver` 懒渲染，`web-scope` + 1240px 定宽 `scale(0.32)`

约束与既有事实（均已核对源码）：

- [buinessweb/src/website/blocks.ts](../../../buinessweb/src/website/blocks.ts) 已提供整套树操作：`moveBlock` / `removeBlock` / `insertBlock` / `mapChildren` / `moveChild` / `insertChild` / `removeChild` / `findNode` / `collectIds` / `countNodes` / `maxDepth` / `validateTree` / `checkInsert` / `projectInsert`，以及 **`duplicateTree(node, taken)`**（整树深拷贝 + `uniqueBlockId` 重生成 id + 保留 `visible` / `children`）
- 区块是**树**不是平铺数组：`Block` 带可选 `children`，结构版本 `CURRENT_BLOCK_SCHEMA_VERSION = 2`；`SECTION_REGISTRY` 分 `layer: module | atom`，`canAccept(type,'atom')` 决定可装载子内容的模块
- `BLOCK_LIMITS = { maxDepth: 4, maxNodes: 400, maxChildren: 50 }`，前端 `checkInsert` / `validateTree` 与后端 `blocksSchema` 递归校验一致，任一侧调整需同步
- `pages` 草稿是 JSONB 整份覆盖（`PUT /pages/:id/draft`），没有 `/pages/reorder`（`registerReorder` 只注册 banners / faqs / menus / 两类分类）
- `MEDIA_REF_TARGETS`（[content.ts:176](../../../backend/src/routes/content.ts)）为 6 张表：`pages / products / articles / article_drafts / product_drafts / banners`
- `pageDefaults.ts` 导出 `DEFAULT_BLOCKS` 与 `defaultBlocks(slug)`，五套默认区块（home / about / products / news / contact）
- 迁移目录已有 `002–006`、`010–013`；`008` 属已弃做归档的 `page-publication-approval`（未落地），`009` 为空号
- **不存在 `page_versions` / 历史快照 / 审批状态**：`page-publication-approval` 已整体弃做归档，零代码零迁移。因此「已保存后回滚到历史版本」不成立
- 前端整份覆盖草稿在并发下会丢更新；本 change 引入跨页写入必须处理

## Goals / Non-Goals

**Goals:**

- 顺序调整、复制、复用从「多次点击 + 手抄」变成一次拖拽 / 一次选择
- 模板成为可积累资产，且**复用组件库抽屉与真实渲染卡片**，不新增弹窗、不新增路由、不挤占三栏
- 任何新增写入路径都不破坏既有「保存草稿 → 发布」链路与结构版本 2 的嵌套护栏

**Non-Goals:**

- 不做全局共享区块（一处改全站生效）——需引用模型与失效传播，另案
- 不做撤销/重做栈：靠「放弃草稿」回退；**已保存后只能手动重装修或重新发布修正版本**（无历史快照）
- 不做区块跨父级自由拖移、不做嵌套分组编辑
- 不做模板审核与个人/团队范围隔离
- 不改渲染层、官网前台与发布流程；不改组件库抽屉的定位与交互约定

## Decisions

### D1 拖拽用原生 HTML5 DnD，且限定「同层同父」

只在结构树行的把手上开 `draggable`，`dragstart` 记录 `block.id` 与其父序列（`parentId` 或顶层），`dragover.prevent` + 插入指示线，`drop` 时对**同一父序列**内重排，跨父序列（顶层 ↔ 某模块 `children`、A 模块 → B 模块）一律拒绝并给出提示。

**B3 实现口径（执行时确定）**：`moveBlock` / `moveChild` 是 ±1 位移语义（上移/下移按钮专用），不支持任意落点；拖拽重排用「`removeBlock` / `removeChild` + `insertBlock` / `insertChild`（指定 index）」不可变组合实现，向下拖时移除后目标索引需 -1（off-by-one）。重排后按源 id 用 `findNode` 重算 `selPath`，避免索引错位。

限定同层的原因：结构树是嵌套的，跨父移动会改变 `depth` 与 `maxChildren`，可能撞上 `canAccept(type,'atom')` 语义（基础元素不能当顶层模块），也可能悄悄改变 `BLOCK_LIMITS`。跨父「移动」在本期由「删除 + 从组件库/模板插入」表达，不引入隐式结构变更。

替代方案：`vuedraggable` / Sortable.js（新增依赖与体积，且跨树拖拽的落点判定更复杂）。上下移按钮**保留**并同样限定同层，作为触屏与键盘的等效路径——满足 spec 的「拖拽与按钮结果一致」。把手补 `aria-label`，行支持键盘焦点。

### D2 复制复用 `duplicateTree`，不再造 `duplicateBlock`

`blocks.ts` 已有 `duplicateTree(node, taken)`：整树深拷贝、逐节点 `uniqueBlockId(type, taken)`、保留 `visible` 与 `children`。同页复制直接 `duplicateTree(src, new Set(collectIds(blocks.value)))`，再 `insertBlock` 到源之后。刻意不用 `genBlockId`（不保证页内唯一）、不新写 `duplicateBlock`（会漏掉 `children`，把带子内容的模块复制成空壳）。

复制是**副本**不留关联：不做引用型区块（那属于被排除的全局共享区块范畴）。

### D3 跨页复制走服务端行锁，API 统一为单一路径

统一为 `POST /pages/:targetSlug/blocks/copy`，body `{ sourcePageId, blockIndex, targetIndex? }`。服务端在单事务内 `SELECT draft_json ... FOR UPDATE` 目标行 → 用与前端一致的深拷贝语义（含 `children`）追加/插入副本 → 写回 → 返回目标页最终区块数与提示文案。

**A1 物化口径（执行时确定）**：目标页 `draft_json = '{}'` 表示「未保存过草稿，回落线上版本」，服务端必须先物化 `content_json.blocks` 作为追加基底，再插入副本——若直接把只含复制块的数组写进 draft，后续发布会把整页替换成该单个区块。源区块同样按「draft_json 有区块 → content_json」的回落链读取，与编辑器口径一致。服务端副本 id 由 `backend/src/blocks.ts` 的 `duplicateBlockTree`（type 前缀 + 6 位随机 + 碰撞重试，C3）生成；整树副本与草稿追加内容均过 `deepSanitize`（A2 同口径）。跨页复制与模板 CRUD 均写 `audit_logs`（entity_type 分别为 `page` / `block_template`，C1）。

`proposal` 旧版曾写成 `POST /pages/:id/blocks/:index/copy-to`，与 tasks / design 不一致，本版统一为前者（target 用 slug 与现有页面路由风格一致，source 用 id 避免 slug 歧义）。

为什么不在前端「读目标草稿 → 改 → PUT」：必然与整份覆盖语义冲突，两人同时操作时后写者静默丢掉前者改动；服务端加行锁是唯一可靠写法。服务端同样要跑 `checkInsert` 等价的深度/数量校验，不能只信任前端。

### D4 模板入库：`block_templates`，迁移顺接 013

```
block_templates(id, name, type, props jsonb, created_by, created_at, updated_at)
  UNIQUE(name, type)
```

文件改为 **`backend/sql/migrations/014_block_templates.sql`**（+ 同号 rollback），不再用旧稿的 `009`：现有迁移已到 013，回填空号会让按序执行的部署脚本出现「旧号新执行」的错乱；`008` 是已弃做审批工作流的预留号，同样不复用。

接口 `GET /block-templates`（关键词 + 类型过滤 + 分页）、`POST`、`PATCH /:id`、`DELETE /:id`，读写权限沿用 `content:write`。删除取「任何有写权限者可删 + 二次确认」：模板不是线上内容，误删影响面只是「下次插入少个选项」，不值得设计归属与审批。

### D5 插入时做 props 兼容合并

`mergeBlockProps(type, props)`：以 `SECTION_REGISTRY[type].defaultProps()` 为底覆盖模板字段（`list` / `object` 整体覆盖，不做元素级 diff）。`type` 不在注册表 → 标记 `unavailable`，插入入口隐藏、管理列表保留以便清理。这样注册表演进不会让历史模板炸表单。

模板只存**单个区块**的 `props`，`children` 不入库（子内容属于页面实例，不是模板资产）；插入时 `checkInsert` 仍按整树试算。

### D6 「铺入默认内容」复用 `defaultBlocks(slug)`

`DEFAULT_BLOCKS` / `defaultBlocks(slug)` 继续作为数据源，编辑器在草稿为空或运营主动选择时追加填入；只对存在默认集的 slug 显示入口，自定义新页面不提供。默认区块自带 `children` 的，`duplicateTree` 后仍需过 `checkInsert`。

### D7 双选中态共存：`selPath` 是主选中，`selectedIds` 只服务批量

单选 `selPath: number[]` 是编辑器核心（`BlockForm` 的 key、预览折叠、插入目标），**不改造为 id**。新增 `selectedIds: Set<string>` 仅用于批量删除 / 批量存模板；需要索引时用 `findNode(blocks, id)` 即时算路径。拖拽、删除、插入后先重算路径再刷新 `selPath`，避免索引错位。

### D8 模板不参与素材引用扫描（明确不做）

模板里的图片 URL 只是「将来可能被复制进页面的候选值」，不构成线上引用；区块插入页面后，引用关系已由 `pages` 行被 `MEDIA_REF_TARGETS` 覆盖。因此不把 `block_templates` 加入扫描目标——加了只会让素材库出现无法点击的幽灵引用。

### D9 模板体积与条数上限

`props` 序列化后 ≤ 256KB、`list` 类字段条目 ≤ 200，用 zod 在服务端拒绝（`rich-text` 的 `html` 最可能撑大）。前端给出对应提示。

### D10（新增）模板面板 = 组件库抽屉的第二个标签页

不新增弹窗、不新增路由、不在三栏里加第四栏。`ComponentLibraryPanel.vue` 顶部加 `el-tabs`：

- **「组件库」**：现有「模块 / 基础元素」分段与真实渲染卡片，行为零变化
- **「模板库」**：`BlockTemplatePanel.vue`（列表 / 搜索 / 类型过滤 / 存为模板 / 从模板插入 / 改名 / 删除）

抽屉标题由「公共组件库」改为「组件库与模板」，左栏按钮保持单一入口（文案可改「组件库 / 模板」）。`el-tabs` 切换不影响抽屉的 `append-to-body=false` / `modal=false` 定位，也不影响「背景三栏可操作」。

旧稿 4.6「新增区块弹窗补从模板插入标签页」作废——编辑器已无新增区块弹窗，组件插入统一在抽屉内。

**接缝改造**：`LibraryCard` 目前只渲染 `libraryDemoBlocks(type)`（默认骨架）。模板缩略要显示模板自身内容，因此给它加可选 `blocks?: Block[]`：

```ts
const demo = computed(() => props.blocks ?? libraryDemoBlocks(props.item.type));
```

模板面板把 `mergeBlockProps` 后的单个 Block 包成数组传入，即可复用同一套 `web-scope` 缩放、`IntersectionObserver` 懒渲染与禁用样式；`item.reason` 复用来展示「类型已下线」。组件库调用方不传 `blocks`，行为零变化。这是本 change 对前置 change 的**唯一代码接缝**，需连同 `LibraryCard` 的单测一起改。

### D11（新增）所有新增写入统一过结构护栏

复制 / 从模板插入 / 批量删除 / 铺默认内容 / 跨页复制，都要：

1. 新节点用 `uniqueBlockId(type, collectIds(tree))` 或 `duplicateTree`
2. 写入前 `checkInsert(tree, node, target)` 试算，超限即拒绝并提示，不修改 `blocks`
3. 写入后 `validateTree(blocks)` 无错误才允许 `dirty` 置位与保存
4. `children` 一并复制，禁止把带子内容的模块拍平成顶层区块或丢掉子内容

后端 `POST /pages/:targetSlug/blocks/copy` 用与 `BLOCK_LIMITS` 一致的校验，前端校验不能作为唯一防线。

## Risks / Trade-offs

- [原生 DnD 浏览器差异（Firefox 需 `setData`、Safari 拖影）] → 显式设置拖拽数据 + 视觉插入线不依赖 drag image；保留上下移按钮兜底
- [拖拽与 `deep watch` 交互导致预览闪烁或 dirty 抖动] → 顺序变更走不可变数组替换、预览 `:key` 用 `block.id`（现状已满足），改动只做一次赋值
- [嵌套树里跨父拖拽悄悄破坏上限/层级语义] → D1 限定同层同父，跨父直接拒绝并提示改用删除 + 插入
- [复制丢 `children` 导致模块变空壳] → D2 强制复用 `duplicateTree`，单测覆盖「带 3 个子内容的模块复制后子内容数量与 id 均不同」
- [跨页复制是「副本」，源页面后续修改不会同步] → UI 文案明确「复制的是副本，之后互不影响」；真正的共享需求留给将来的全局区块 change
- [与其他 change 同时改 `editor.vue` 造成冲突] → 改动限制在结构树行模板、`ComponentLibraryPanel.vue` 的 tabs、`BlockTemplatePanel.vue` 与 `LibraryCard.vue` 的可选 prop；不动顶栏动作条、抽屉定位与三栏骨架。抽屉化已先行交付，本 change 不再重构左栏
- [模板数量随时间膨胀、近似重复] → 列表按类型过滤 + 关键词搜索；重名唯一约束迫使命名收敛；不做审核以换取低摩擦
- [批量删除不可撤销] → 确认弹窗显示数量与区块标题清单；未保存可用「放弃草稿」回退，**已保存后只能手动重装修或重新发布修正版本**（`page_versions` 从未落地，不得在文案里承诺历史快照回滚）

## Migration Plan

1. `backend/sql/migrations/014_block_templates.sql`（仅新增表，对 `pages` 无改动）
2. 后端：模板 CRUD + zod 体积校验 + `POST /pages/:targetSlug/blocks/copy`（事务 + 行锁 + 服务端结构校验）
3. 前端：`api/cms.ts` / `types/cms.ts` 增加 `BlockTemplate` 与方法；`blocks.ts` 增加 `mergeBlockProps` / `isTemplateUsable`（复制直接用已有 `duplicateTree`）
4. 前端：`LibraryCard.vue` 加可选 `blocks`；`ComponentLibraryPanel.vue` 加 tabs 并挂 `BlockTemplatePanel.vue`
5. 前端：结构树行把手拖拽（同层同父）+ 选择集 + 批量操作 + 跨页复制弹窗
6. 验证：按 `specs/block-decoration/spec.md` 场景逐条走查，并执行 `docs/装修编辑器验收清单.md`

回滚：`DROP TABLE block_templates;` + `git revert`；`pages` 表结构与线上内容不受影响，已插入页面的区块是普通副本，回滚后仍正常渲染。

## Open Questions

- 是否需要撤销/重做栈（当前只有「放弃草稿」；历史快照随审批工作流弃做而不可用）
- 模板是否需要「仅创建者可见」范围，或按业务线分组
- 是否需要把整页（多区块）保存为「页面模板」一键铺页——本 change 只做区块粒度
- 是否允许跨父序列「移动」区块（当前 D1 明确拒绝，若运营确有需求需另立含结构校验的 change）
