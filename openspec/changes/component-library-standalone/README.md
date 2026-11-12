# component-library-standalone

组件库抽屉化与编辑器三栏重构：库中组件按**真实渲染效果**展示（与官网同源实现），由装修编辑器**右侧抽屉**单独打开；编辑器回归纯三栏（页面结构 / 内容编辑 / 实时预览）。

> 名称中的 standalone 指「组件库从左栏分离、成为可独立打开的抽屉」，**不是**独立路由页。上一版设计中的 `/admin/website/library` 独立页与 `insert` query 跨页插入已按需求方决定删除。

## 抽屉打开位置（需求方问点）

- 从**编辑器右侧**滑出（`direction="rtl"`），宽 480px、可拖拽调宽，贴着实时预览栏、只覆盖右栏
- 抽屉挂在 `.ed-body` 内（不 append 到 body），因此**不遮顶栏**的保存草稿 / 发布 / 下线
- `modal=false` + `modal-penetrable=true`：抽屉打开时左侧「页面结构」树与中栏「内容编辑」仍可点击——插入位置依赖选中节点，不能被遮罩锁死
- 左栏头部「组件库」按钮打开；插入成功后自动关闭抽屉，实时预览立即恢复并显示新节点

## 在全链路中的位置

- 前置：`home-decoration-components`（已落地）——渲染器、官网样式缩放、注册表 `layer/accepts/defaultProps`、插入判据全部由它提供，本 change 只做组合
- 后继：`decoration-editor-toolkit` 排在本 change 之后（两者都动编辑器左栏；toolkit 的模板面板将复用本 change 的 `LibraryCard` 做模板缩略真实预览）
- 与 `site-runtime-link-integrity` 剩余任务无文件冲突（不碰路由、不碰官网前台）

## 关键交付物

- `specs/component-library/spec.md` — 真实渲染、右侧抽屉、插入、三栏、性能兼容（5 项要求 / 17 个场景）
- `design.md` — 7 项决策：单形态右侧抽屉（否决独立页 / 左侧抽屉 / 左栏常驻 / 全屏弹窗）、demo 取注册表默认骨架、渲染复用官网实现、数据驱动模块 `demo` 透传不发请求、懒渲染、左栏重构、与 toolkit 的顺序
- `tasks.md` — 26 项任务，分 5 组

## 明确排除（按本期边界）

- 独立组件库路由页、后台菜单新入口、跨页插入
- 组件库 demo 内容在线编辑（demo 固定 = 默认骨架 + 占位样例）
- 组件收藏 / 常用置顶、移动端适配
- 区块模板库（属 `decoration-editor-toolkit`）

## 零后端改动

不新增接口、不新增迁移；插入仍走编辑器既有草稿保存链路，结构与上限校验单点不变。

## 实施状态（2026-11-10）

代码与文档已落地，`tasks.md` 26 项中 21 项打勾。已完成：真实渲染卡片（`LibraryCard` / `LibraryGrid` / `libraryDemo.ts` / `libraryDemoData.ts`）、数据驱动模块 `demo` 透传不发请求、右侧抽屉与左栏纯结构树、88 项单测与前后端类型检查、两份设计/执行文档回写。剩余 5 项为人工/环境验收：浏览器抽屉交互走查、端到端保存→预览→发布闭环、官网前台回归、20+ 组件性能基线、`openspec validate --strict`（本机无该 CLI）。逐条操作步骤与预期结果见 `docs/装修编辑器验收清单.md` A 部分（同一文件预置了后继 `decoration-editor-toolkit` 的 B 部分判据）。
