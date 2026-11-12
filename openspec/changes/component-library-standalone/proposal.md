## Why

组件库目前常驻装修编辑器左栏上半段（`ComponentLibraryPanel.vue`），两件事拖累运营效率：

1. **库里的缩略不是真实渲染**：每个组件的缩略是纯 CSS 示意图形（模块画色带、基础元素画极简线框），运营看不出「插入后到底长什么样」，只能插入后在预览里试错，不合适再删掉重来；
2. **左栏双职责**：「组件库 + 页面结构」两段挤在同一栏，结构树只有半栏高度，长页面（九模块 + 子内容）要频繁滚动找节点。

渲染基建其实已经齐了——`home-decoration-components` 落地了递归渲染器（`SectionRenderer`）、官网样式定宽缩放（`web-scope` + website.css，右栏预览在用）、注册表 `defaultProps()` 内容骨架与 `checkInsert` 插入约束。需求方明确本期**只用一个抽屉承载公共组件库**（不建独立路由页、不做跨页插入）：组件在抽屉里以真实效果单独展示，点一下加载进当前装修页面；编辑器回归纯三栏（页面结构 / 内容编辑 / 实时预览）。

## What Changes

- 新增共享的组件卡片渲染（`LibraryCard` / `LibraryGrid`）：每个组件用**官网同一渲染器 + 默认内容骨架**真实渲染——模块经官网样式定宽缩放（约 0.3 倍）、基础元素原比例；数据驱动模块（精选产品 / 最新资讯 / 产品矩阵 / 资讯列表 / FAQ）以内置占位样例渲染，**MUST NOT** 因预览发起内容请求
- 组件库从左栏移出，改由**编辑器右侧抽屉**承载（`direction="rtl"`、`size="480px"`、可拖拽调宽）：
  - 左栏头部「组件库」按钮打开抽屉；抽屉贴着实时预览栏、只覆盖右侧区域
  - `modal=false` + `modal-penetrable=true`：抽屉打开时**页面结构树与内容编辑表单仍可操作**（插入位置依赖选中节点），顶栏保存/发布/下线不被遮挡
  - 抽屉内保留搜索、层（模块/基础元素）与分组过滤、目标位置提示；点击卡片即插入当前页（模块 → 顶层选中项之后；基础元素 → 选中模块子内容末尾；不可插入展示原因；只读禁用）
  - 插入成功后自动关闭抽屉，实时预览立即显示新节点
- 编辑器左栏重构为**纯「页面结构」树**：组件库段移除，结构树独占左栏全高
- **不做**独立组件库路由页、后台菜单新入口、`insert` query 跨页插入（上一版设计中已删除）
- **零后端改动**：不新增接口、不新增迁移；插入仍走编辑器既有草稿保存链路，结构与上限校验（checkInsert / validateTree / 嵌套保存护栏）单点不旁路
- 无破坏性变更：区块数据模型 `{id,type,visible,props,children?}`、前台渲染、保存与发布流程均不变

## Capabilities

### New Capabilities

- `component-library`：组件库的真实渲染展示、右侧抽屉打开方式、插入到装修页面的行为契约与渲染开销约束

### Modified Capabilities

（无——`home-module-components` 已定的两层结构、`accepts` 装载约束不变；`block-decoration`（decoration-editor-toolkit，未落地）的拖拽/模板要求不变，实施顺序见两份 README）

## Impact

- 前端新增：
  - `buinessweb/src/website/libraryDemoData.ts` — 数据驱动模块的内置占位样例（纯数据，避免与注册表循环引用）
  - `buinessweb/src/website/libraryDemo.ts` — demo Block 构造（注册表默认骨架 + 示例子内容）
  - `buinessweb/src/views/admin/website/components/LibraryCard.vue` + `LibraryGrid.vue` — 真实渲染卡片、懒渲染、不可用原因
- 前端修改：
  - `buinessweb/src/views/admin/website/pages/editor.vue` — 左栏重构为纯结构树、右侧组件库抽屉、插入后关闭抽屉
  - `buinessweb/src/views/admin/website/components/ComponentLibraryPanel.vue` — 缩略改为共享卡片真实渲染，插入判据逻辑保留（面板本体成为抽屉内容）
  - `buinessweb/src/website/SectionRenderer.vue` — 增加可选 `demo` 透传（只在组件库预览生效）
  - `buinessweb/src/website/sectionRegistry.ts` — 导出数据驱动类型清单
  - `buinessweb/src/website/sections/{SecFeatureProducts,SecLatestNews,SecProductGrid,SecNewsFeed,SecFaqList}.vue` — `demo` 模式下用内置样例、跳过接口调用
- 路由 / 后台菜单：**无改动**
- 后端：**无改动**（零接口、零迁移、零 schema 变更）
- 官网前台：无改动
- 流程：运营选组件从「插入后试错」变为「先看效果再插入」；组件库从常驻占位变为按需打开
