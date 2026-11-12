## 1. 共享卡片渲染基建（LibraryCard / LibraryGrid）

- [x] 1.1 新建 `src/website/libraryDemoData.ts`：数据驱动模块的内置占位样例（产品 / 资讯 / FAQ / 分类），纯数据不 import 注册表
- [x] 1.2 新建 `src/website/libraryDemo.ts`：`libraryDemoBlocks(type)` 构造 demo Block（默认骨架 + 示例子内容），构造幂等
- [x] 1.3 `sectionRegistry.ts` 导出 `DATA_DRIVEN_TYPES`；`SectionRenderer.vue` 增加可选 `demo` 并只向数据驱动模块透传
- [x] 1.4 5 个数据驱动区块组件（`SecFeatureProducts` / `SecLatestNews` / `SecProductGrid` / `SecNewsFeed` / `SecFaqList`）在 `demo` 模式下用内置样例、跳过接口调用
- [x] 1.5 新建 `LibraryCard.vue`：容器挂 `web-scope` + website.css，`SectionRenderer` 渲染单模块并 `scale(0.32)`，基础元素原比例；预览舞台 `pointer-events:none`；保留 `.lib-cell` / `.lib-label` / `.lib-type` / `.lib-reason` DOM 契约
- [x] 1.6 新建 `LibraryGrid.vue` 循环卡片；`IntersectionObserver` 懒渲染实现在 `LibraryCard` 内（进入可视区才挂载、触发后 `disconnect()`；无 IO 环境降级为「效果预览」占位框）；卡片预览区定高 170px / 88px
- [x] 1.7 单测：demo 构造幂等、类型下线过滤、示例子内容结构合法（过 `validateTree`）；`cd buinessweb && npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`

## 2. 编辑器右侧抽屉与左栏重构

- [x] 2.1 `editor.vue` 左栏移除组件库段（`ed-lib` 及相关样式与列头），结构树独占左栏全高；左栏头部加「组件库」按钮与节点数
- [x] 2.2 `el-drawer` 挂 `ComponentLibraryPanel`：`direction="rtl"`、`size="480px"`、`resizable`、`:append-to-body="false"`、`modal=false` + `modal-penetrable=true` + `lock-scroll=false` + `close-on-click-modal=false`；`.ed-body > .el-overlay { position: absolute }` 使抽屉只盖右栏、不遮顶栏
- [x] 2.3 `ComponentLibraryPanel.vue` 把 CSS 缩略替换为 `LibraryGrid` 真实卡片，插入判据 props（`moduleTarget` / `atomTarget` / `parentType` / `parentLabel` / `canWrite`）与 emit 全部原样保留，`onPick` 点击时二次复核 reason
- [x] 2.4 插入成功后自动关闭抽屉（`onLibraryInsert` 比对 `nodeCount`），新节点由 `insertFromLibrary` 的 `selPath` 选中；被拒时抽屉保持打开以便看提示与调整选中项；只读账号可打开浏览但卡片禁用（`rejectReason` 返回权限原因），`dirty` 由 `watch(blocks)` 统一置位、只读不置位
- [x] 2.5 验证：`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；单测全绿（本机并行 worker 启动超时，改用 `--pool=forks --maxWorkers=1 --no-file-parallelism` 分批跑完 10 个文件 / 88 tests）
- [ ] 2.6 浏览器走查 spec 场景：右侧抽屉打开、抽屉打开时改选结构节点、插入模块 / 基础元素、原因提示、只读、超限拒绝、插入后预览恢复 —— **待人工走查**

## 3. 单测与回归

- [x] 3.1 新增 `libraryDemo.spec.ts`：6 项（幂等、未知类型、注册表新增类型自动可预览、示例子内容过 `validateTree`、数据驱动模块无子内容、样例字段完整）
- [x] 3.2 `ComponentLibraryPanel.spec.ts` 既有 10 项断言全绿（抽屉化后 DOM 契约不变）
- [x] 3.3 `editor.spec.ts`：ElDrawer 打桩使面板在单测内可查询；新增「左栏无 `.ed-lib`、点 `.ed-lib-open` 后 drawer `modelValue=true`」断言；共 9 项全绿
- [x] 3.4 `SectionRenderer.spec.ts` 既有 9 项全绿（未传 `demo` 时行为零变化）

## 4. 文档回写（逐文件点名）

- [x] 4.1 `docs/service-design/02-官网低代码装修平台设计与实施文档.md` 新增 §12：右侧抽屉单形态、真实渲染同源口径、demo 取默认骨架
- [x] 4.2 `docs/前端执行文档.md` 新增 §8（`LibraryCard` / `LibraryGrid` / `libraryDemo.ts` / `libraryDemoData.ts` 目录职责、懒渲染约定、`web-scope` + website.css 复用、抽屉定位口径），后续演进顺延为 §9
- [x] 4.3 `openspec/changes/decoration-editor-toolkit/README.md`：实施顺序（排在本 change 之后，模板面板复用 `LibraryCard`；口径已改「右侧抽屉单形态」）
- [x] 4.4 验证：grep 关键口径（组件库抽屉 / LibraryCard / libraryDemo），旧方案命中的均为「明确不做 / 已删除」类说明，无活跃残留

## 5. 端到端验收

- [x] 5.1 前端 `pnpm type-check` 通过；后端 `npx tsc --noEmit` 通过（后端零改动仍绿）；单测 10 文件 / 88 tests 通过（本机以单 worker forks 分批执行）
- [ ] 5.2 浏览器闭环：打开抽屉（验证懒渲染只挂可视区）→ 插入模块 → 抽屉关闭、预览刷新 → 修改内容 → 保存草稿 → `/preview/:slug` 预览 → 发布 → 官网生效 —— **待人工走查**
- [ ] 5.3 回归：官网前台 5 个导航页零变化；编辑器既有场景（上下移、显隐、删除、只读、折叠预览）抽样走查 —— **待人工走查**
- [ ] 5.4 性能基线：抽屉内 20+ 组件全量渲染后的滚动帧率与内存各记录一次（对照懒渲染首屏）—— **待人工记录**
- [ ] 5.5 `openspec validate component-library-standalone --strict` 通过 —— **本机无该 CLI**（私有 Verdaccio 无 `@openspec/cli`、无外网），待可用环境补跑；文档结构已按 spec-driven 模板与 `openspec/config.yaml` rules 人工对齐

---

## 执行状态（2026-11-10 收尾）

代码、单测、类型检查与文档回写已完成（1.1–1.7 / 2.1–2.5 / 3.1–3.4 / 4.1–4.4 / 5.1，共 21 项）。剩余 5 项均为**环境或人工验收类**，不阻塞代码交付：

| 项 | 待办 | 依赖 |
| --- | --- | --- |
| 2.6 | 抽屉交互浏览器走查 | 可用浏览器 + 后台账号 |
| 5.2 | 端到端闭环（保存 → 预览 → 发布 → 官网） | 可用浏览器 + 数据库环境 |
| 5.3 | 官网前台与编辑器既有场景回归 | 可用浏览器 |
| 5.4 | 20+ 组件滚动帧率 / 内存基线 | 可用浏览器 + 性能面板 |
| 5.5 | `openspec validate --strict` | 安装 OpenSpec CLI 的环境 |

以上 5 项的逐条操作步骤、预期结果与勾选框见 `docs/装修编辑器验收清单.md` A 部分（A1–A5 与本表一一对应），验收结论按该文档 D 部分回填本表。
