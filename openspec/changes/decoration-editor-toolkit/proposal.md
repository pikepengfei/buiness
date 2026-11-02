## Why

装修器目前只有「新增 / 删除 / 上下移 / 显隐」四个动作（[editor.vue:59-95](../../../buinessweb/src/views/admin/website/pages/editor.vue)）：调整两个区块顺序要点好几次箭头，想在另一个页面复用一段内容只能照着抄一遍，而每个新页面都从零开始敲。运营做装修的时间大量花在机械操作上，且同一类区块在不同页面手抄后风格漂移。

## What Changes

- 区块列表支持拖拽排序（原生 HTML5 拖放，不新增依赖），保留上下移按钮作为等价手段
- 区块一键复制：在同页生成一份深拷贝（新 id、插入到源之后），编辑互不影响
- 跨页复用：把某页面的一段区块复制到另一个页面的草稿末尾或指定位置，服务端在事务内读改写以避免丢失更新
- 新增区块模板库：把任意区块存为可复用模板、从模板插入到当前页；模板为全局共享并记录创建人，支持改名与删除
- 内置默认模板：`pageDefaults.ts` 的五套默认区块（home/about/products/news/contact）成为模板来源之一，新页面可「按页面类型一键铺模板」
- 模板插入时与该类型的 `defaultProps` 做浅合并，字段漂移或 `type` 已下线的模板被标记为不可用并从插入入口隐藏
- 编辑器支持多选区块的批量操作（删除 / 存为模板），减少重复点击
- 无破坏性变更：区块数据模型 `{id,type,visible,props}` 与 `pages.content_json` 结构不变，前台渲染与发布流程不受影响

## Capabilities

### New Capabilities

- `block-decoration`: 装修器的区块操作能力（排序、复制、跨页复用、模板库、批量操作）与模板数据的行为契约

### Modified Capabilities

（无——`page-routing` / `site-navigation` / `page-publication` 的要求均不变；区块顺序的持久化沿用既有草稿保存）

## Impact

- 数据：新增迁移 `backend/sql/migrations/009_block_templates.sql`（`block_templates` 表）
- 后端：`backend/src/routes/content.ts` 新增 `/block-templates` CRUD 与 `POST /pages/:id/blocks/:index/copy-to`；复用 `deepSanitize` 与 `jsonb` 工具
- 前端：`buinessweb/src/views/admin/website/pages/editor.vue`（拖拽、选择、动作条）、新增 `components/BlockTemplatePanel.vue`、`buinessweb/src/website/blocks.ts`（复制与合并辅助）、`api/cms.ts`、`types/cms.ts`
- 依赖：无新增 npm 依赖
- 流程：模板插入与跨页复制都会把目标页面标记为脏并重置审核状态（与 `page-publication` 一致）
