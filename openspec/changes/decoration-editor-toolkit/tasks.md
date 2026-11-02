## 1. 数据与后端：区块模板

- [ ] 1.1 新增 `backend/sql/migrations/009_block_templates.sql`：`block_templates` 表 + `UNIQUE(name,type)` + `(type, created_at DESC)` 索引，同步 `schema.sql`
- [ ] 1.2 `GET /block-templates`：关键词 + 类型过滤 + 分页，返回 `created_by` 姓名与 props 体积
- [ ] 1.3 `POST /block-templates`：zod 校验 `name/type/props`，`type` 必须在允许集合内；序列化后 ≤ 256KB、`list` 条目 ≤ 200
- [ ] 1.4 `PATCH /block-templates/:id` 与 `DELETE /block-templates/:id`（均需 `content:write`，删除由前端二次确认）
- [ ] 1.5 重名冲突返回可读错误（区分「已存在」与「体积超限」）
- [ ] 1.6 `types/cms.ts` + `api/cms.ts` 增加 `BlockTemplate` 与 CRUD 方法

## 2. 前端：区块操作辅助函数

- [ ] 2.1 `website/blocks.ts` 增加 `duplicateBlock(block)`（深拷贝 + `genBlockId`，保留 `visible` 原值）
- [ ] 2.2 增加 `mergeBlockProps(type, props)`：以注册表 `defaultProps()` 为底覆盖，`list/object` 整体覆盖
- [ ] 2.3 增加 `isTemplateUsable(type)`（注册表中是否存在）
- [ ] 2.4 为上述三个函数补单元测试（含旧模板缺字段、未知类型、副本与原块互不影响）

## 3. 前端：拖拽排序与多选

- [ ] 3.1 左栏区块行增加把手 `draggable`，`dragstart` 记录 `block.id` 并 `setData('text/plain', id)`
- [ ] 3.2 `dragover` 阻止默认并显示插入位置指示线，`drop` 以不可变替换方式调整顺序（等价 `moveBlock`）
- [ ] 3.3 保留上移/下移按钮，验证两者结果一致；把手补 `aria-label`，行支持键盘焦点
- [ ] 3.4 选择态改为 `selectedIds: Set<string>`，索引即时计算；新增全选/取消全选
- [ ] 3.5 批量删除：确认弹窗显示受影响数量与标题清单，取消则不改动
- [ ] 3.6 批量「全部存为模板」：按「类型 + 序号标题」自动命名，逐个入库并汇总重名跳过项

## 4. 前端：模板面板与默认内容

- [ ] 4.1 新增 `views/admin/website/components/BlockTemplatePanel.vue`：列表（类型过滤 + 搜索）、存为模板、插入、管理（改名/删除）
- [ ] 4.2 「存为模板」弹窗支持命名与默认名建议（区块标题或类型中文名）
- [ ] 4.3 「从模板插入」在选中位置插入 `mergeBlockProps` 后的新区块，不可用模板不出现在插入列表
- [ ] 4.4 不可用模板在管理列表中标记「类型已下线」，仅提供删除
- [ ] 4.5 「按页面类型铺入默认内容」入口：仅当 `defaultBlocks(slug)` 非空时显示，追加到现有草稿之后并二次确认
- [ ] 4.6 新增区块弹窗补「从模板插入」标签页，与既有类型分组并列

## 5. 跨页复制

- [ ] 5.1 `POST /pages/:targetSlug/blocks/copy`：入参 `sourcePageId`、`blockIndex`、可选 `targetIndex`
- [ ] 5.2 服务端单事务 `SELECT draft_json ... FOR UPDATE` 目标行 → 深拷贝源区块 → 追加或插入 → 写回 `draft_json`
- [ ] 5.3 权限校验：目标页面需 `content:write`，否则 403 且不改数据
- [ ] 5.4 写入后按既有规则重置目标页审核状态，响应返回目标页最终区块数与提示文案
- [ ] 5.5 区块行菜单增加「复制到…」弹窗：选择目标页面（可写页面列表）+ 插入位置（末尾/指定序号）
- [ ] 5.6 成功提示明确「复制的是副本，之后互不影响」，并提供跳转到目标页编辑器

## 6. 验证与交付

- [ ] 6.1 走查 `block-decoration` 全部场景（拖拽与按钮一致、副本独立编辑、跨页复制与并发不丢改动、模板存/插/重名/删除、旧模板字段补齐、类型下线、批量操作与取消）
- [ ] 6.2 确认前台渲染与发布流程无改动（`SectionRenderer`、`/public/pages` 行为不变）
- [ ] 6.3 backend `npx tsc --noEmit` 与 buinessweb `npx vue-tsc --noEmit` 通过
- [ ] 6.4 素材库删除引用扫描抽样验证：区块被复制进页面后仍能被 `pages` 扫描到，`block_templates` 未被加入扫描目标
- [ ] 6.5 在 `docs/service-design/` 装修器章节补：拖拽/复制/模板的使用说明与命名规范建议
