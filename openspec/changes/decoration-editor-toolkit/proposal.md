## Why

> **2026-11-10 衔接修订**：前置 change `component-library-standalone` 已交付「组件库右侧抽屉 + 三栏结构」，本提案按该形态重写。旧稿中的「新增区块弹窗」「左栏平铺区块列表」「`duplicateBlock`」「`009` 迁移」均为过时落点，已作废。

装修器当前只有「从组件库插入 / 删除 / 上下移 / 显隐」四个动作（[editor.vue](../../../buinessweb/src/views/admin/website/pages/editor.vue)）：调整两个区块顺序要点好几次箭头，想在另一个页面复用一段内容只能照着抄一遍，而每个新页面都从零开始敲。运营做装修的时间大量花在机械操作上，且同一类区块在不同页面手抄后风格漂移。

另一方面，组件库抽屉已经提供了「先看真实效果、再放进页面」的统一入口与真实渲染卡片。模板库若另起弹窗，会重新把编辑区切成第四块、并复制一套缩略渲染逻辑；直接作为抽屉第二个标签页接入，成本最低且交互一致。

## What Changes

- 区块结构树支持**同层同父**的拖拽排序（原生 HTML5 拖放，不新增依赖），保留上下移按钮作为等价手段；跨父序列拖移明确拒绝
- 区块一键复制：同页生成整树深拷贝（含 `children`、逐节点新 id、插入到源之后），编辑互不影响；**复用已有 `duplicateTree`，不新增 `duplicateBlock`**
- 跨页复用：`POST /pages/:targetSlug/blocks/copy` 把某页面的一段区块复制到另一页面草稿末尾或指定位置，服务端在事务内读改写以避免丢失更新，并做结构上限校验
- 新增区块模板库：把任意区块存为可复用模板、从模板插入到当前页；模板为全局共享并记录创建人，支持改名与删除
- **模板库作为组件库抽屉的第二个标签页**：`ComponentLibraryPanel.vue` 加 `el-tabs`（组件库 / 模板库），新增 `BlockTemplatePanel.vue`；左栏仍是唯一的「组件库 / 模板」入口，三栏结构不变
- **模板缩略复用 `LibraryCard` 真实渲染**：给 `LibraryCard` 增加可选 `blocks?: Block[]`，模板面板传入自身内容即可复用缩放、懒渲染与禁用样式；组件库调用方不传，行为零变化
- 内置默认模板：`pageDefaults.ts` 的 `defaultBlocks(slug)` 五套默认区块成为模板来源之一，新页面可「按页面类型铺入默认内容」
- 模板插入时与该类型 `defaultProps()` 做兼容合并；字段漂移或 `type` 已下线的模板标记不可用并从插入入口隐藏
- 编辑器支持多选区块的批量操作（删除 / 存为模板）；单选 `selPath` 保持不变，多选 `selectedIds` 只服务批量动作
- 所有新增写入路径统一走 `checkInsert` / `validateTree` 与 `BLOCK_LIMITS` 护栏，服务端跨页复制同样校验
- 无破坏性变更：区块数据模型 `{id,type,visible,props,children?}`、结构版本 2、`pages.draft_json` 结构不变，前台渲染、草稿保存与发布流程不受影响

## Capabilities

### New Capabilities

- `block-decoration`: 装修器的区块操作能力（排序、复制、跨页复用、模板库、批量操作）与模板数据的行为契约

### Modified Capabilities

- 对 `component-library` 的**实现扩展**（不改其行为契约）：组件库抽屉内增加第二个标签页，`LibraryCard` 增加可选 `blocks` prop。「组件库以真实渲染效果展示」「由编辑器右侧抽屉单独打开」「三栏结构」等既有要求全部保持，验收时需回归。

## Impact

- 数据：新增迁移 `backend/sql/migrations/014_block_templates.sql`（`block_templates` 表，顺接现有 013；不复用 008/009 空号）；`pages` 表结构不变
- 后端：`backend/src/routes/content.ts` 新增 `/block-templates` CRUD 与 `POST /pages/:targetSlug/blocks/copy`；复用 `deepSanitize` 与 jsonb 工具，`MEDIA_REF_TARGETS` 不改动
- 前端：
  - `buinessweb/src/views/admin/website/pages/editor.vue`（结构树行把手、选择集、批量动作条、行菜单「复制到…」）
  - `buinessweb/src/views/admin/website/components/ComponentLibraryPanel.vue`（tabs）
  - `buinessweb/src/views/admin/website/components/LibraryCard.vue`（可选 `blocks`）
  - 新增 `components/BlockTemplatePanel.vue`
  - `buinessweb/src/website/blocks.ts`（`mergeBlockProps` / `isTemplateUsable`；复制用已有 `duplicateTree`）、`api/cms.ts`、`types/cms.ts`
- 依赖：无新增 npm 依赖
- 流程：模板插入与跨页复制都会把目标页面标记为脏；审批工作流已弃做归档，无审核状态联动，也**无历史快照可回滚**——已保存的误操作只能手动重装修或重新发布修正版本
- 验收：统一执行 `docs/装修编辑器验收清单.md`（含前置抽屉 change 的回归项）
