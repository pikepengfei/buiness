## Why

组件库卡片与编辑器实时预览都声称「用官网同一渲染器、同一份官网样式」，但实测下来**官网样式在这两处一条都没生效**：预览里的模块是「无样式的裸 HTML + 后台字体」，运营看到的和上线后的页面是两个东西。

根因不是渲染器，而是样式引入方式：`@import url('@/assets/website.css')` 被写在 `<style scoped>` 里。Vite 的 postcss-import 会先把 35.6KB 官网样式**内联**进该 SFC 的 style 块，随后 Vue 编译器给每条选择器追加 `data-v-xxx`，于是官网的 `.hero` 变成 `.hero[data-v-9ec6d0c6]`；而预览里的区块来自**子组件**，带的是它们自己的 `data-v`，永远匹配不上。在编辑页实测遍历样式表：命中 `.hero` 的 20 条规则**全部带 scoped 属性，不带属性的 0 条**。全站唯一真正生效的官网样式入口是 `src/layout/WebsiteLayout.vue` 的**非 scoped** `<style>`——这正好解释了「官网正常、预览失真」。

同一浏览器同一窗口下的实测差异（官网列与隔离宿主列取 1280px 视口）：

| 观测项 | 官网实际 | 预览现状 | 同源 iframe 宿主实测 |
| --- | --- | --- | --- |
| 正文字体 | `"Source Han Sans SC","PingFang SC",…` | `PingFangSC,"PingFang SC",serif` | 与官网一致 |
| 正文行高 | 25.6px | `normal` | 25.6px |
| 正文颜色 | `rgb(22,22,22)` | `rgb(0,0,0)` | `rgb(22,22,22)` |
| 首屏模块上下内边距 | 96px | **0px** | 96px |
| 首屏模块背景 | `rgb(248,245,240)` | **透明** | `rgb(248,245,240)` |
| 内容容器最大宽度 | 1240px | **无限制** | 1240px |
| 首屏主标题字号/字重 | 54px / 800 | **32px / 700**（与窗口宽度无关） | 54px / 800 |
| 品牌色变量 | `#DE6420` | 取不到 | `#DE6420` |

除样式失效外还有三处结构性偏差：

1. **响应式判定错位**：预览是「1280px 定宽画布 + `transform: scale()`」。媒体查询按**后台窗口宽度**判定（实测 705px），于是桌面预览显示的是移动版式（首屏变单列、区块内边距从 96px 掉到 64px）。缩放只改变显示尺寸，改变不了断点，`vh`/`vw` 同理。
2. **基础元素卡片连作用域类都没有**：`LibraryCard.vue` 只给模块挂 `web-scope`，基础元素不挂，`.web-scope` 前缀的规则全部落空。
3. **预览没有页面外壳**：实时预览只渲染区块，没有官网导航与页脚，运营看不到模块在真实页面里的上下文与首屏位置。

本次已在运行中的浏览器里验证了修复路径可行（同源 iframe + 复制宿主样式表 + 末尾追加官网样式原文 + 把宿主创建的节点移入 iframe 文档）：iframe 内实测得到上表右列的全部数值，把 iframe 宽度从 1280px 改成 500px 后 `max-width: 640px` 断点立即命中、首屏内边距变 64px、主标题变 34px，改回 1280px 又完整恢复；同时后台自身按钮内边距仍是 `5px 16px`、后台正文字体仍是 `PingFangSC`——**双向不串味**。单个宿主的样式环境构建耗时实测 50ms（宿主 78 张样式表 / 内联约 397KB + 官网样式 35.6KB）。

## What Changes

- 新增**同源 iframe 预览宿主**（`WebsiteFrame.vue` + `previewFrame.ts`）：预览内容仍由官网渲染器产出，经 Vue Teleport 注入 iframe 文档；iframe 内复制宿主**全部**样式表并在**末尾**追加官网样式原文，复现与官网完全相同的层叠环境。后台样式进不去预览、预览样式也漏不到后台
- **设备视口 = iframe 宽度**：新增桌面 / 平板 / 手机视口切换，断点、百分比、`vh`/`vw` 按所选设备宽度真实判定；缩放倍率只改变显示大小，MUST NOT 改变版式判定结果
- **实时预览带官网外壳**：`WebsiteLayout.vue` 的内容区增加默认插槽（回落 `<router-view />`），预览复用真实导航与页脚，而不是另抄一份
- **组件库卡片与组件库页详情弹窗改用同一宿主**：模块与基础元素都进官网作用域；卡片点击仍落到插入动作，预览内链接不会把后台带离编辑页
- **草稿变更即时同步**：仍是同一个 Vue 应用实例（Teleport 只搬 DOM，不搬应用），字段编辑、显隐、排序、插入、删除、模板插入都在同一交互内反映到预览；同步幂等，反复切换视口/倍率不重复挂载、不累积监听
- **预览内交互态保留、导航被拦截**：悬停/聚焦等状态与官网一致；捕获阶段拦截链接跳转与表单提交，未保存草稿不会因误点预览而丢失
- **清理 4 处失效的 scoped 官网样式导入**（编辑器、组件库卡片、组件库页、草稿预览页），官网样式入口收敛为「宿主复制 + Layout 非 scoped」两条
- **不改官网样式与全局 tokens**：`src/assets/website.css` 与 `src/assets/style/*` 零改动；区块数据模型、前台渲染、保存与发布链路零改动
- **零后端改动**：不新增接口、不新增迁移、不改 schema；无 **BREAKING**

## Capabilities

### New Capabilities

- `website-preview`：官网预览的保真契约——同源样式环境、设备视口与响应式、草稿即时同步与幂等、页面外壳与内容三态、交互态可见但不导航、渲染开销与既有链路不受影响

### Modified Capabilities

- 对 `component-library`（`component-library-standalone` 已交付）的**实现替换**：其行为契约不变——「以真实渲染效果展示」「右侧抽屉单独打开」「插入到装修页面」「三栏结构」「懒渲染与兼容」全部保留，本次把「真实渲染」从「样式实际失效」修到「与官网逐项一致」，验收时需整体回归
- 对 `block-decoration`（`decoration-editor-toolkit` 已交付）的**连带受益**：模板缩略复用同一张卡片，无需改动模板面板即获得同样的保真度；模板插入与批量操作链路不变

## Impact

- 前端新增：
  - `buinessweb/src/website/previewFrame.ts` — 样式环境收集与缓存、设备视口预设、宿主文档构建与释放、head 增量镜像（纯逻辑，可单测）
  - `buinessweb/src/website/WebsiteFrame.vue` — iframe 宿主组件：Teleport 注入、视口宽度与缩放、滚动模式、导航拦截、就绪/失败态
  - `buinessweb/src/website/previewFrame.spec.ts` — 样式收集顺序、官网样式置末、设备预设与倍率计算、缓存签名与释放幂等
  - `buinessweb/src/website/WebsiteFrame.spec.ts` — 宿主组件的视口/倍率透传、就绪与失败态、指针屏蔽模式、卸载释放（宿主文档构建打桩）
- 前端修改：
  - `buinessweb/src/views/admin/website/pages/editor.vue` — 实时预览栏改挂宿主（设备视口切换 + 倍率）、删除失效的 scoped `@import`（第 951 行）与 1280px 定宽画布样式
  - `buinessweb/src/views/admin/website/components/LibraryCard.vue` — 卡片预览改挂宿主、基础元素同样进官网作用域、删除失效的 scoped `@import`（第 78 行）、懒渲染改为「懒挂载 + 保活上限」；`.lib-cell` / `.lib-label` / `.lib-type` / `.lib-reason` / `data-lib-type` DOM 契约与 `pick` 事件保持不变
  - `buinessweb/src/views/admin/website/pages/components.vue` — 详情弹窗预览改挂宿主（缩放/底色调节保留）、删除失效的 scoped `@import`（第 419 行）
  - `buinessweb/src/layout/WebsiteLayout.vue` — 内容区增加默认插槽（回落 `<router-view />`）；第 212–214 行的非 scoped 官网样式入口**保留不动**
  - `buinessweb/src/views/website/Preview.vue` — 删除失效的 scoped `@import`（第 48 行）；该页在 Layout 内本就拿到官网样式，渲染结果不变
  - `buinessweb/src/views/admin/website/components/ComponentLibraryPanel.vue` / `LibraryGrid.vue` — 仅在卡片宿主保活策略需要时透传参数，插入判据与 tabs 结构不变
- 单测：`buinessweb/src/views/admin/website/pages/editor.spec.ts`、`components/ComponentLibraryPanel.spec.ts`、`website/SectionRenderer.spec.ts` 需按宿主打桩调整（happy-dom 不保证 iframe 文档与 Teleport 行为），既有断言口径不放宽
- 路由 / 后台菜单：**无改动**（不新增页面、不新增入口）
- 后端：**无改动**（零接口、零迁移、零 schema 变更，因此无迁移脚本与反向回滚脚本）
- 官网前台：`WebsiteLayout.vue` 插槽为回落式改动，5 个固定导航页与动态页渲染结果零变化；`website.css` 与全局 tokens 不改
- 依赖：**无新增 npm 依赖**（iframe / Teleport / MutationObserver / ResizeObserver 均为原生能力）
- 文档回写：`docs/service-design/02-官网低代码装修平台设计与实施文档.md`（预览保真口径与设备视口）、`docs/前端执行文档.md`（宿主目录职责与「官网样式不得写进 scoped」的硬约束）、`docs/装修编辑器验收清单.md`（新增 C 部分：逐项一致性实测判据）
- 流程：运营从「插入后到预览里试错」变为「库中所见即上线所得」；装修预览从「后台窗口决定版式」变为「所选设备决定版式」