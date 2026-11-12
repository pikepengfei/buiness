依赖：本 change 建立在 `home-decoration-components` 已落地的基础上——递归渲染器（`SectionRenderer`）、官网样式定宽缩放（`web-scope` + website.css + transform scale，编辑器右栏预览在用）、注册表 `layer/band/accepts/defaultProps`、插入约束（`checkInsert` / `insertRejectReason` / `validateTree`）全部已存在。本 change 只做「组合」：把这些基建拼成抽屉内的真实组件预览，不新增渲染机制。

## 现状盘点

- 组件库常驻编辑器左栏上半段（`ComponentLibraryPanel.vue`），缩略为纯 CSS 示意：模块画色带 / 虚线块，基础元素画线框 / 色块——与真实效果无关
- 编辑器名义三栏，实际左栏承担「组件库 + 页面结构」两段（`editor.vue` 的 `ed-blocks` 栏内 `ed-lib` + `ed-block-list` 两区），`ed-body` 为 `260px / minmax(340,420) / 1fr` 三列网格
- 插入链路完整且经过 8.2 走查：`moduleTarget` / `atomTarget` → `rejectReason`（权限 / 位置 / 上限三层）→ `insertFromLibrary` → dirty 标记
- 数据驱动模块（`feature-products` / `latest-news` / `product-grid` / `news-feed` / `faq-list`）在 `onMounted` 里直接调公开接口；组件库预览若原样挂载会发出真实请求，必须单独处理
- 编辑器预览已有懒折叠先例（节点 >120 折叠未选中模块），组件库的懒渲染与之同思路

## Goals / Non-Goals

**Goals:**

- 组件库每个组件展示真实渲染效果（与官网同源、同实现）
- 组件库由右侧抽屉单独打开，抽屉打开时三栏仍可操作
- 编辑器回归纯三栏：页面结构 / 内容编辑 / 实时预览
- 插入行为与既有约束完全一致（位置、上限、权限、不可用原因提示）

**Non-Goals:**

- 不做独立组件库路由页与后台菜单新入口（需求方明确「只用一个抽屉」）
- 不做跨页插入（`insert` query 落地一并删除）
- 不做组件库 demo 内容的在线编辑（demo 固定取默认骨架 + 占位样例）
- 不做组件收藏 / 常用置顶、移动端适配
- 不改区块数据模型与前台渲染（无迁移、无接口）
- 不做区块模板（把区块存为可复用模板）——属 `decoration-editor-toolkit` 的范围

## Decisions

### D1 单形态：组件库只由编辑器右侧抽屉承载

`el-drawer` 从编辑器右侧滑出（`direction="rtl"`、`size="480px"`、`resizable`），挂在 `.ed-body` 内（`:append-to-body="false"`，覆盖层定位改为相对 `.ed-body` 的 absolute），只覆盖右侧实时预览栏；`modal=false` + `modal-penetrable=true` + `lock-scroll=false` + `close-on-click-modal=false`，让页面结构树、内容编辑表单与顶栏在抽屉打开时仍可点击；左栏头部「组件库」按钮打开，插入成功后自动关闭抽屉使预览立即恢复。

选「右侧」而不是其他位置的理由：
- 插入位置完全依赖左栏结构树的选中项（模块插到选中项之后、基础元素插到选中模块的子内容），左栏与中栏必须始终可见可操作；
- 实时预览是三栏里唯一可以临时让位的一栏，且插入后抽屉关闭即恢复并高亮新节点；
- 真实组件预览需要宽度：模块按官网 1240px 定宽缩到 0.3 倍约 380px，左栏 260px 放不下，右侧 480px 抽屉刚好；
- 抽屉挂 `.ed-body` 而非 body，避免遮住顶栏的「保存草稿 / 发布 / 下线」。

否决的替代方案：
- **独立路由页** `/admin/website/library`：需求方明确不做；且装修动线被切断（选组件要跳出编辑器再跳回来）；
- **左侧抽屉**（`direction="ltr"`）：盖住结构树，运营无法「选中模块 → 插基础元素」；
- **维持左栏常驻、仅把缩略换成真实渲染**：左栏双职责不解决，且 20+ 组件真实渲染常驻挂载，开销不可控；
- **全屏弹窗 / el-dialog**：把三栏全遮住，插入后看不到结构变化；
- **modal=true 的常规抽屉**：背景被遮罩锁死，无法在抽屉打开时改选插入目标。

### D2 预览数据 = 注册表默认内容骨架，不建库表

demo Block 固定为 `{ id: 派生, type, visible: true, props: defaultProps() }`；声明 `accepts: ['atom']` 的模块自动塞 1–2 个示例原子（示例文字 / 按钮）让子内容版式可见。注册表保持唯一数据源——新增组件自动进库、类型下线自动消失，没有第二份需要同步的清单。

否决的替代方案：**建 `component_demos` 表存每个组件的演示数据**——多一份与注册表同步的负担，且 demo 内容运营无从维护，收益为零。

### D3 卡片渲染复用官网渲染器与官网样式，不为库另写一套

模块卡片：容器挂 `web-scope`、页面引入 website.css（沿用 `editor.vue` / `WebsiteLayout.vue` 的 `@import` 方案——由浏览器解析、不受 scoped 影响），内部用 `SectionRenderer` 渲染单模块，外层 `transform: scale(≈0.3)` 缩放、卡片定高裁切（与编辑器右栏 `ed-canvas` 同一手法）。基础元素卡片原比例直接渲染。预览舞台设 `pointer-events: none`，卡片外层的点击统一落到插入动作，避免误触组件内部链接/按钮而跳转。

否决的替代方案：
- **截图/静态图**：每个组件要人工维护截图，改版即失真，且构建期截图引入额外依赖；
- **保留 CSS 示意**：就是现状，运营看不出效果，本 change 的出发点即否决它。

### D4 数据驱动模块走 `demo` 透传，预览不发请求

`SectionRenderer` 增加可选 `demo` 属性，只对数据驱动模块透传 `{ demo: true }`；5 个数据驱动区块组件在 `demo` 模式下用 `libraryDemoData.ts` 的内置样例填充列表 / 分类 / FAQ，跳过 `onMounted` 的接口调用与筛选分页的取数。官网前台与编辑器预览不传 `demo`，行为零变化。示例数据单独放 `libraryDemoData.ts`（纯数据、不 import 注册表），避免与 `sectionRegistry.ts` 形成循环引用。

否决的替代方案：
- **组件库里不渲染数据驱动模块，只显示文字占位**：看不出模块版式，等于这些组件「没有预览样式」；
- **在库里 mock /api 请求**：改动面更大，且预览仍依赖异步返回，卡片高度会跳；
- **给所有预览统一加 `preview` 判断跳过取数**：编辑器右栏预览原本就要显示真实数据，语义冲突。

### D5 懒渲染 + 卡片定高

`IntersectionObserver`：卡片进入可视区才挂载真实渲染，触发后即 `disconnect`（滚出后保留已渲染结果，不销毁重建，避免来回滚动闪烁）。卡片定高（模块缩略约 180px）保证滚动条稳定。无 `IntersectionObserver` 的环境（单测 happy-dom）不挂载预览，只留占位框——行为降级但不影响插入与判据。

否决的替代方案：**一次性全量渲染**——20+ 模块每个都是带官网样式的整段渲染，抽屉打开首屏要挂几十个组件树；**虚拟滚动**——库总量级（<40 项）用不上，徒增复杂度。

### D6 编辑器左栏重构为纯结构树

移除 `ed-lib` 段与其列头，结构树独占左栏全高；左栏头部放「组件库」按钮与节点数。抽屉内的 `ComponentLibraryPanel` 保留既有全部 props（判据、目标提示、搜索、只读提示）与 `.lib-cell` 等 DOM 契约，避免既有单测与交互回归。

### D7 与 `decoration-editor-toolkit` 的顺序与复用

本 change 先行（重排左栏结构），toolkit 随后（拖拽把手、多选、模板面板都搭在新结构树上）。正向复用：toolkit 的 `BlockTemplatePanel` 可直接复用本 change 的 `LibraryCard` 渲染做「模板缩略真实预览」。反向约束：本 change 不动区块行操作（上移/下移/删除），避免与 toolkit 的拖拽改造打架。

## 三态口径（内容可见性）

组件库预览不涉及线上内容三态（demo 数据本地构造、不发请求）；抽屉内**目标位置提示**沿用编辑器现有逻辑（无选中模块时提示「请先选中一个可装载子内容的模块」）。数据源是本地注册表，库本身无 empty / error 态；搜索无命中沿用既有 `el-empty` 空态。

## 迁移与回滚

无数据变更：零迁移、零接口、零 schema 改动。回滚 = 前端 `git revert`，无反向脚本。

## Open Questions

- 卡片是否要可视化「可装载位置」说明（`accepts` 的图示）？首期仅文字标注
- 抽屉 480px 在窄屏（<1280px）是否自动降到 360px，走查后定
- 连续插入多个组件时是否保持抽屉打开（当前口径：每次插入后自动关闭以露出预览），走查后可按运营习惯调整
