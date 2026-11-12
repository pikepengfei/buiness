> **2026-11-10 衔接重排**：前置 `component-library-standalone` 已交付右侧组件库抽屉与三栏结构，本清单按该架构重排；新增 §0「前置衔接与接缝改造」，所有旧稿中与「新增区块弹窗 / 平铺区块数组 / 009 迁移 / duplicateBlock / 历史快照」相关的落点已替换。实施顺序：§0 → §1/§2 可并行 → §3/§4 → §5 → §6/§7。
>
> **2026-11-12 执行记录**：代码全部交付——后端迁移 014 + 模板 CRUD + 跨页复制（含 A1 物化 / A2 deepSanitize / C1 audit / C3 服务端 id 修复），前端拖拽（B3 remove+insert）/ 批量 / 同页与跨页复制 / 模板库标签页（B1 双层 / B2 覆盖 / B4 只读 / C2 强确认）/ 铺默认内容；前端 103 项单测与双侧类型检查全绿。仅 §7.2（验收清单 A/B 浏览器人工验收）与 openspec CLI strict 校验因环境待办。

## 0. 前置衔接与接缝改造

- [x] 0.1 确认 `component-library-standalone` 已交付：右侧抽屉（`rtl` / 480px / `append-to-body=false` / `modal=false`）、左栏纯结构树、`LibraryCard` / `LibraryGrid` 真实渲染、`demo` 透传不发接口；其 `tasks.md` 21/26 项已打勾，剩余 5 项为人工验收
- [x] 0.2 `LibraryCard.vue` 增加可选 `blocks?: Block[]`（`const demo = computed(() => props.blocks ?? libraryDemoBlocks(props.item.type))`）；组件库调用方不传时行为零变化，补 1 项单测验证「传入自定义 Block 时渲染其自身内容」（`ComponentLibraryPanel.spec.ts` 3 项新测试：自定义内容渲染 / 不传回落 / reason 禁用通道复用）
- [x] 0.3 `ComponentLibraryPanel.vue` 顶部加 `el-tabs`（「组件库」/「模板库」，模板页 `lazy` 挂载），`editor.vue` 抽屉标题改「组件库与模板」、左栏按钮文案改「组件库 / 模板」；抽屉定位参数与三栏骨架不动，`ComponentLibraryPanel.spec.ts` 既有 10 项断言全绿

## 1. 数据与后端：区块模板

- [x] 1.1 新增 `backend/sql/migrations/014_block_templates.sql` + 同号 rollback：`block_templates` 表 + `UNIQUE(name,type)` + `(type, created_at DESC)` 索引 + `set_updated_at` 触发器，同步 `schema.sql`（未复用 008/009 空号）
- [x] 1.2 `GET /block-templates`：关键词 + 类型过滤 + 分页，返回 `created_by` 姓名（LEFT JOIN users 取 display_name/username）与 props 体积（`OCTET_LENGTH`，响应字段 `props_bytes`）
- [x] 1.3 `POST /block-templates`：zod 校验 `name/type/props`，type 按注册表键形态校验（后端不重复维护类型清单，与 pages 既有口径一致；语义可用性由前端 `isTemplateUsable` 把关）；序列化后 ≤ 256KB、任意列表字段条目 ≤ 200；只存区块自身 `props`，不存 `children`
- [x] 1.4 `PATCH /block-templates/:id` 与 `DELETE /block-templates/:id`（均需 `content:write`，删除由前端二次确认）
- [x] 1.5 重名冲突返回可读错误（`UNIQUE(name,type)` 冲突 → 409「已存在同名模板，请改名或用覆盖更新」，与体积超限 400 区分）
- [x] 1.6 `types/cms.ts` + `api/cms.ts` 增加 `BlockTemplate` / `BlockCopyResult` 与 CRUD 方法（`cmsAdmin.blockTemplates.*` / `cmsAdmin.pages.copyBlock`）

## 2. 前端：区块操作辅助函数

- [x] 2.1 复制**复用已有 `duplicateTree(node, taken)`**：`taken = new Set(collectIds(blocks))`，不新增 `duplicateBlock`、不用 `genBlockId`；单测覆盖「带 3 项子内容的模块复制后子内容数量一致、id 全不同、修改副本不影响源」（`blocks.spec.ts` 新 describe 第 1 项）
- [x] 2.2 新增 `mergeBlockProps(type, props)`：以注册表 `defaultProps()` 为底覆盖，`list/object` 整体覆盖；未知类型返回空对象
- [x] 2.3 新增 `isTemplateUsable(type)`：**按 spec「任意区块可存模板」执行（B1）**——类型在注册表即可用（模块与基础元素双层），atom 模板插入走 `atomTarget`（模块 children），模块模板走 `moduleTarget`（顶层），未在实现里限死 `layer==='module'`
- [x] 2.4 为 2.1–2.3 补单元测试（含旧模板缺字段、未知类型、副本与原块互不影响；另含近上限复制被拒与模板插入无重复 id 两项护栏测试，共 6 项新增）

## 3. 前端：结构树拖拽排序与多选

- [x] 3.1 结构树 `treeRows` 的行把手（`⋮⋮`，带 `aria-label`）开 `draggable`，`dragstart` 记录 `block.id` + 父序列标识（`parentId` 或顶层），并 `setData('text/plain', id)`（Firefox 必需）
- [x] 3.2 `dragover` 阻止默认并以行高亮 `outline` 显示插入位置指示；`drop` 校验**同层同父**后用「remove + insert（B3）」不可变组合重排（向下拖目标索引 -1），跨父序列拒绝并提示改用「删除 + 组件库 / 模板插入」
- [x] 3.3 保留上移/下移按钮（`moveRow`）且同样限定同层，拖拽与按钮结果一致（`editor.spec.ts` 专项测试）；把手补 `aria-label`，行支持键盘焦点（`tabindex="0"` + Enter 选中）
- [x] 3.4 新增 `selectedIds: Set<string>` 仅用于批量动作（D7）；单选 `selPath` 保持不变，批量动作后用 `findNode` 重算路径；新增全选/取消全选（含子内容行）
- [x] 3.5 批量删除：确认弹窗显示受影响数量与标题清单，取消则不改动且不清除选中态
- [x] 3.6 批量「存模板 N」：按「类型中文名 + 序号」自动命名，逐个入库并汇总重名跳过项
- [x] 3.7 行菜单增加「同页复制 ⧉」：调 `duplicateTree` → `checkInsert` → 插入源之后 → 选中副本；带 `children` 的大模块超限时按 §6 拒绝（近上限单测覆盖）

## 4. 前端：模板面板与默认内容

- [x] 4.1 新增 `views/admin/website/components/BlockTemplatePanel.vue`，由 §0.3 的「模板库」标签页挂载：列表（类型过滤 + 搜索 + 分页）、存为模板、插入、管理（改名/删除）
- [x] 4.2 模板卡片用 `LibraryCard` 真实渲染：把 `mergeBlockProps` 后的单个 Block 包成数组传给 0.2 的 `blocks` prop；不可用模板用 `item.reason` 标「类型已下线」（`rejectReason` 四层判据：类型 / 权限 / 目标 / 上限）
- [x] 4.3 「存为模板」弹窗支持命名与默认名建议（区块标题或类型中文名，`suggestedName`）
- [x] 4.4 「从模板插入」复用编辑器的插入目标（模块模板 `moduleTarget` / 基础元素模板 `atomTarget`，B1 双层）与 `checkInsert`，插入后选中新节点并关闭抽屉；不可用模板不出现在插入列表（`editor.spec.ts` 模板插入测试覆盖）
- [x] 4.5 「按页面类型铺入默认内容」入口：仅当 `defaultBlocks(slug)` 非空时显示，追加到现有草稿之后并二次确认（C2：已有内容时文案明确「可能出现同类内容重复」强确认）
- [x] 4.6 删除「新增区块弹窗补从模板插入标签页」（该弹窗已不存在，模板入口只保留抽屉标签页这一处——现状即满足，无代码可删）

## 5. 跨页复制

- [x] 5.1 `POST /pages/:targetSlug/blocks/copy`：入参 `sourcePageId`、`blockIndex`、可选 `targetIndex`（统一路径）
- [x] 5.2 服务端单事务 `SELECT draft_json ... FOR UPDATE` 目标行 → `duplicateBlockTree` 深拷贝源区块（含 `children`、逐节点新 id，C3）→ `validateBlocks` 校验 → 追加或插入 → 写回 `draft_json`；**A1：目标页 draft 为 `{}` 时先物化 `content_json.blocks` 再追加**；副本过 `deepSanitize`（A2）
- [x] 5.3 权限校验：目标页面需 `content:write`（`preHandler: write`），否则 403 且不改数据
- [x] 5.4 响应返回目标页最终区块数与提示文案（「复制的是副本，之后互不影响」）
- [x] 5.5 结构树行菜单增加「复制到… ⇄」弹窗：选择目标页面（`cmsAdmin.pages.list()` 过滤本页）+ 插入位置（末尾/指定序号）；子内容行禁用并提示「跨页复制只支持顶层模块」
- [x] 5.6 成功提示明确「复制的是副本，之后互不影响」，并提供跳转到目标页编辑器（`/admin/pages/editor/:slug`）

## 6. 结构护栏与回归（新增组）

- [x] 6.1 所有新增写入统一：新 id 走 `uniqueBlockId` / `duplicateTree`；写入前 `checkInsert` 试算、写入后由既有 `validateTree` 保存门禁兜底（铺默认内容逐块试算，超限块跳过并提示）
- [x] 6.2 服务端复制接口独立实现与 `BLOCK_LIMITS` 一致的校验（复用 `validateBlocks` zod 递归校验，深度 4 / 节点 400 / 子内容 50 / 顶层 200），超限返回可读原因且不改目标草稿
- [x] 6.3 单测覆盖：复制含子内容模块（`blocks.spec.ts`）、跨父拖移被拒（`editor.spec.ts`）、模板插入后无重复 id（`blocks.spec.ts`）、接近上限时复制被拒（`blocks.spec.ts`，399 节点时 3 节点副本被拒 / 单节点放行）
- [x] 6.4 回归前置 change：`ComponentLibraryPanel.spec.ts`（13 tests）/ `editor.spec.ts`（15 tests）/ `SectionRenderer.spec.ts`（9）/ `libraryDemo.spec.ts`（6）全绿；全量 10 文件 103 tests 通过；组件库标签页的搜索、懒渲染、只读禁用、插入后关抽屉行为零变化

## 7. 验证与交付

- [x] 7.1 走查 `block-decoration` 全部 9 项要求 / 27 个场景：代码级逐场景对照完成（含新增「基础元素模板插入落点」「页面已有内容时铺入」两场景）；其中 B1.2 / B1.4 / B2.3 / B9.1 / B9.2 有单测，其余经静态走查，浏览器复验归 §7.2 与验收清单 B 部分
- [ ] 7.2 执行 `docs/装修编辑器验收清单.md`：A 部分（前置组件库抽屉的 5 项人工/环境验收）+ B 部分本 change 验收——需真实浏览器 / 双账号 / PostgreSQL 环境与人工执行，判定栏与遗留项待回填
- [x] 7.3 确认前台渲染与发布流程无改动（`SectionRenderer`、`/public/pages`、`/preview/:slug` 零改动；`web-scope` 渲染链路只读复用）
- [x] 7.4 backend `npx tsc --noEmit` 与 buinessweb `pnpm type-check` 通过；全量单测 103/103 绿（单 worker forks 执行，规避本机并行超时）
- [x] 7.5 素材库删除引用扫描抽样验证：区块复制进页面后写入 `pages.draft_json`，仍在 `MEDIA_REF_TARGETS` 的 `pages` 扫描范围内；`block_templates` 未加入 `MEDIA_REF_TARGETS`（D8 口径）
- [x] 7.6 `docs/service-design/02-官网低代码装修平台设计与实施文档.md` 新增 §13（拖拽同层同父 / 同页与跨页复制 / 模板库标签页 / 批量操作 / 模板命名规范建议）；`docs/前端执行文档.md` 补 `BlockTemplatePanel.vue` 目录职责与 `LibraryCard` 可选 `blocks` 约定
