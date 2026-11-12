> 本 change **零数据变更**（无接口、无迁移、无 schema 改动），因此不存在「迁移脚本 + 反向回滚脚本」成对任务；回滚为前端 `git revert`。
> 类型检查命令统一为 `cd buinessweb && npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`；单测命令 `cd buinessweb && npx vitest run`（本机并行 worker 易启动超时，必要时加 `--pool=forks --maxWorkers=1 --no-file-parallelism`）。
> 场景编号对应 `specs/website-preview/spec.md` 的六项要求：R1 逐项一致 / R2 设备视口 / R3 即时同步与幂等 / R4 外壳与三态 / R5 交互态不导航 / R6 开销与既有链路。

## 1. 预览宿主基建（`previewFrame.ts` / `WebsiteFrame.vue`）

- [ ] 1.1 新建 `src/website/previewFrame.ts`：设备视口预设（桌面 1440 / 平板 834 / 手机 390，常量集中一处）与「可见宽度 → 自动倍率」「设备宽度 × 倍率 → 外层占位尺寸」纯函数
- [ ] 1.2 同文件：样式环境收集——按宿主 `document.styleSheets` 原顺序产出「`<style>` 文本 / `<link>` 引用」序列，末尾追加官网样式原文（`import websiteCss from '@/assets/website.css?raw'`）；按样式表签名做模块级缓存，签名变化才重新取文本
- [ ] 1.3 同文件：宿主文档构建——写入 `<!doctype html>` 与 `<base href="/">`、按序注入样式、建根容器并挂官网作用域类；返回挂载点与释放函数，释放幂等（重复调用不报错、不残留）
- [ ] 1.4 同文件：head 增量镜像——`MutationObserver` 监听宿主 head 的样式节点增删与文本变化，按序镜像进所有存活预览文档并始终保持官网样式置末；提供注销入口
- [ ] 1.5 新建 `src/website/WebsiteFrame.vue`：props 覆盖设备宽度、显示倍率、滚动模式（内部滚动 / 自动高度）、是否屏蔽指针事件；`Teleport` 指向宿主挂载点，文档就绪后才渲染内容
- [ ] 1.6 `WebsiteFrame.vue` 状态：未就绪显示占位、构建失败显示不可用提示 + 重试（R1 失败场景）；重试成功后恢复正常预览
- [ ] 1.7 `WebsiteFrame.vue` 交互隔离：在预览文档捕获阶段拦截链接点击与表单提交并 `preventDefault()`，发出「预览内不跳转」提示；屏蔽指针事件模式下不装拦截（点击归外层卡片）
- [ ] 1.8 `WebsiteFrame.vue` 生命周期：设备宽度/倍率变化只改尺寸不重建文档；卸载时释放文档、断开观察器与事件监听（R3 / R6 幂等）
- [ ] 1.9 验证：`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；新增 `previewFrame.spec.ts` 覆盖「官网样式恒在末位」「设备预设与倍率换算」「缓存签名命中/失效」「释放幂等」；浏览器探针走查 R1「首屏模块逐项一致」与 R2「窄后台窗口下的桌面预览」

## 2. 编辑器实时预览接入设备视口与官网外壳

- [ ] 2.1 `src/layout/WebsiteLayout.vue`：内容区改为「默认插槽 + 回落 `<router-view />`」；第 212–214 行的非 scoped 官网样式入口保留不动（官网前台不传插槽，渲染结果零变化）
- [ ] 2.2 `editor.vue` 右栏：`.ed-canvas` 定宽画布替换为 `WebsiteFrame`（内部滚动模式），预览内容包在 `WebsiteLayout` 插槽里以带出导航与页脚（R4「外壳与官网一致」）
- [ ] 2.3 `editor.vue` 顶栏：现有「预览 50%/60%/75%/100%」下拉旁增加设备视口切换（桌面/平板/手机），并标明当前设备与实际倍率；倍率默认按右栏可见宽度自动适配，手动选择后覆盖自动值
- [ ] 2.4 `editor.vue`：右栏可见宽度变化（窗口缩放、抽屉开合、拖拽调宽）时重算自动倍率，用 `ResizeObserver` 且卸载即断开
- [ ] 2.5 `editor.vue`：删除失效的 scoped `@import`（第 951 行）与 `.ed-canvas` 的 1280px 定宽相关样式；保留 `.ed-canvas-wrap` 作为预览区容器
- [ ] 2.6 `editor.vue`：预览折叠策略（节点数超阈值折叠未选中模块）保持不变；折叠提示与设备/倍率标尺同时可见不重叠
- [ ] 2.7 验证：`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；`editor.spec.ts` 既有断言全绿（宿主打桩后 DOM 契约不变）；浏览器走查 R2 全部 5 个场景 + R3「编辑字段即时生效」「结构操作即时生效」+ R5「悬停态」「点击不跳转」

## 3. 组件库卡片与组件库页详情接入同一宿主

- [ ] 3.1 `LibraryCard.vue`：预览区替换为 `WebsiteFrame`（自动高度模式 + 屏蔽指针事件），模块按桌面视口渲染后按倍率缩放裁切；**基础元素同样进官网作用域**（修掉「只有模块挂作用域类」的缺陷）
- [ ] 3.2 `LibraryCard.vue`：内容高度测量 → 卡片占位尺寸换算 → 定高裁切，保证列表滚动条稳定、卡片不跳（D8）
- [ ] 3.3 `LibraryCard.vue`：懒挂载保留 `IntersectionObserver`；新增保活上限（默认 8）与「超出释放最久未可见宿主、再次可见重建」；抽屉/页面卸载时全部释放（R6「保活上限与重建」「反复开合不累积」）
- [ ] 3.4 `LibraryCard.vue`：删除失效的 scoped `@import`（第 78 行）；`.lib-cell` / `.lib-label` / `.lib-type` / `.lib-reason` / `data-lib-type` 与 `pick` 事件、`disabled` 样式、可选 `blocks` 入口全部保持不变（D12）
- [ ] 3.5 `LibraryGrid.vue` / `ComponentLibraryPanel.vue`：仅在保活策略需要时透传参数；搜索、分组过滤、层过滤、tabs（组件库 / 模板库）、插入判据与目标提示零改动
- [ ] 3.6 `pages/components.vue` 详情弹窗：预览舞台替换为 `WebsiteFrame`，保留缩放滑杆与底色切换；`fitScale × zoom` 改由宿主的设备宽度 + 倍率承担，`ResizeObserver` 测量逻辑相应简化；删除失效的 scoped `@import`（第 419 行）
- [ ] 3.7 验证：`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；`ComponentLibraryPanel.spec.ts` 既有 13 项全绿；浏览器走查 R1「组件效果与上线呈现一致」+ R4「组件效果不发起内容请求」（网络面板确认零内容请求）+ R5「卡片点击执行插入」「只读账号点击卡片」+ R6「懒渲染」

## 4. 官网样式入口收敛

- [ ] 4.1 `views/website/Preview.vue`：删除失效的 scoped `@import`（第 48 行）；该页在 Layout 内本就拿到生效的官网样式，删除后逐项目视确认渲染不变
- [ ] 4.2 全仓 grep 确认 `@import url('@/assets/website.css')` 只剩 `layout/WebsiteLayout.vue` 一处（非 scoped），后台预览一律走宿主原文注入
- [ ] 4.3 抽查后台非 scoped 全局样式里的裸元素/裸类选择器，记录可能进入预览的项；确认其在今天的官网同样生效（保真由构造保证），只记录不在本 change 改全局样式
- [ ] 4.4 验证：`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；浏览器走查 R1「后台样式不渗入预览」「预览样式不污染后台」（对照打开预览前后的后台按钮内边距与正文字体）+ 官网 5 个固定导航页与 `/preview/:slug` 目视回归

## 5. 单测与类型检查

- [ ] 5.1 新增 `src/website/previewFrame.spec.ts`：样式收集顺序、官网样式置末、设备预设、倍率与占位换算、缓存签名、释放幂等（≥8 项）
- [ ] 5.2 新增 `WebsiteFrame` 组件单测（宿主文档构建打桩）：设备宽度/倍率透传、就绪前占位、失败态与重试、屏蔽指针事件模式不装导航拦截、卸载释放（≥6 项）
- [ ] 5.3 `editor.spec.ts`：宿主打桩后补齐「设备切换改变传入宽度」「倍率变化不改变设备宽度」断言；既有 15 项不放宽
- [ ] 5.4 `ComponentLibraryPanel.spec.ts` / `SectionRenderer.spec.ts` / `libraryDemo.spec.ts`：既有断言全绿（渲染器与 demo 构造零改动）
- [ ] 5.5 验证：`npx vitest run` 全绿（必要时单 worker forks 分批）；`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 通过；后端零改动仍跑 `cd backend && npx tsc --noEmit` 确认绿；逐条核对 R1–R6 中「失败 / 权限被拒 / 幂等」场景在单测或走查中各有归属，无遗漏

## 6. 浏览器实测一致性（数值判据，非肉眼）

- [ ] 6.1 建立对照脚本口径：同一视口宽度下，分别取官网页面与预览内同一模块的计算样式（字体族、字号、字重、行高、颜色、上下内边距、背景、容器最大宽度、圆角、阴影）与几何量（宽高、列数），逐项列表比对
- [ ] 6.2 桌面视口实测：首页 9 个模块逐项对照，差异项为 0；记录数值表进 `docs/装修编辑器验收清单.md` C 部分
- [ ] 6.3 平板与手机视口实测：同法对照官网在对应宽度下的呈现，断点命中与列数一致；确认倍率 50% 与 100% 的版式结构相同（R2「调整显示倍率不改变版式」）
- [ ] 6.4 组件库全量卡片实测：每个组件的库内效果与「插入页面后发布」的官网呈现对照，差异仅来自内容数据（R1「组件效果与上线呈现一致」）
- [ ] 6.5 三态实测：未发布页面（运营可见 / 访客 404）、数据驱动模块空内容、接口异常（断网或拦截请求）三种表现分别记录（R4 三个场景）
- [ ] 6.6 幂等与开销实测：连续切换设备/倍率各 10 次、开合抽屉 10 次、在 3 个页面编辑器间往返，记录 iframe 数量与监听数量回到稳定值；抽屉从头滚到尾再滚回，记录保活上限生效与重建结果一致（R3 / R6）
- [ ] 6.7 性能记录：单宿主构建耗时（预算 ≤80ms，基线实测 50ms）、抽屉首屏挂载耗时、滚动流畅度与内存各记录一次
- [ ] 6.8 验证：上述数值表全部无差异项；`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 复跑通过；R1–R6 共 31 个场景逐条勾稽，失败项回到对应任务组修复后重跑

## 7. 文档回写（逐文件点名）

- [ ] 7.1 `docs/service-design/02-官网低代码装修平台设计与实施文档.md`：新增预览保真章节——同源隔离宿主、样式环境复制与官网样式置末、设备视口与倍率语义、外壳复用、三态口径
- [ ] 7.2 `docs/前端执行文档.md`：新增 `previewFrame.ts` / `WebsiteFrame.vue` 目录职责与用法；写死硬约束「**官网样式不得写进 `<style scoped>`**，后台预览一律走宿主注入」，并说明 scoped 内联导致失效的原因
- [ ] 7.3 `docs/装修编辑器验收清单.md`：新增 C 部分（逐项一致性数值判据、设备视口、三态、幂等与开销、性能基线），与 tasks 第 6 组一一对应；A/B 部分（抽屉与装修器）保持不变
- [ ] 7.4 `openspec/changes/component-library-standalone/README.md` 与 `openspec/changes/decoration-editor-toolkit/README.md`：各补一行后继指向，说明「真实渲染」的保真口径由本 change 承担，卡片 DOM 契约与模板复用入口不变
- [ ] 7.5 验证：grep 关键口径（预览宿主 / 设备视口 / 官网样式置末 / scoped 失效），旧口径命中的均为「已作废 / 明确不做」类说明，无活跃残留

## 8. 端到端验收与收尾

- [ ] 8.1 闭环走查：打开编辑器 → 组件库抽屉看效果 → 插入模块 → 预览即时更新 → 改内容 → 保存草稿 → `/preview/:slug` 对照 → 发布 → 官网对照，四处呈现逐项一致
- [ ] 8.2 回归走查：官网 5 个固定导航页 + 动态页 + 产品/资讯详情零变化；编辑器既有场景（拖拽排序、上下移、显隐、删除、复制、跨页复制、模板插入、批量、只读、超限拒绝、折叠预览）抽样通过
- [ ] 8.3 只读账号走查：预览可看且与官网一致，编辑/插入/保存全部被拒并给出权限原因，草稿不进入未保存状态（R1 / R5 / R6 权限场景）
- [ ] 8.4 回填勾稽：把第 6 组数值表与第 8 组走查结论回填本文件与验收清单 C 部分；未完成项注明依赖（浏览器 / 账号 / 环境）
- [ ] 8.5 `openspec validate website-preview-fidelity --strict` —— **本机无该 CLI**（私有源无该包、无外网），待可用环境补跑；文档结构已按 spec-driven 模板与 `openspec/config.yaml` 的 rules 人工对齐
- [ ] 8.6 验证（交付门禁）：`cd buinessweb && npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false` 与 `npx vitest run` 全绿、`cd backend && npx tsc --noEmit` 全绿；R1–R6 共 31 个场景逐条签核（单测归属或走查记录二者之一，不允许无归属）；官网前台回归结论与性能基线一并归档到验收清单 C 部分