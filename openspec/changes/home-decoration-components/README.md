# home-decoration-components

首页组件化装修：按颜色带把首页切成 9 个可独立装修的模块，在 `src/components/ui/` 建公共组件文件夹落地文字/图片/按钮基础元素，模块改调基础元素、基础元素与模块一起进管理端组件库。

## 在全链路中的位置

排在 `decoration-editor-toolkit` **之前**（见 `design.md` D8）：工具包的复制、模板、跨页搬运三处都必须按树实现，先在扁平模型上做完再返工是纯浪费。与 `site-runtime-link-integrity`（取消内置回落）**同期或在其之后**（D7），否则容器版式未发布时会退回旧扁平内容。不改 `page-publication-approval` 的审核与快照链路——嵌套结构对它透明（整份 JSONB 快照）。

对应 `docs/service-design/03-组件库堆叠式装修方案选型与实施设计.md` 的 **R2 路线 P1 + 原子件**（该文档的 P0 是 toolkit，P2 拖拽与 P3 组合模板不在本 change）。

## 关键交付物

- `proposal.md` — 9 模块与色带的对应关系、基础元素重复的实测证据（`class="btn"` 手抄 7 处、`<img>` 5 处、`SecHead` 已被 14 个区块复用）
- `specs/home-module-components/spec.md` — 8 项要求 / 30 个场景，覆盖模块划分、基础元素同构、组件库两层插入、深度与数量上限、历史页面兼容读取、写入幂等与并发口径、三态可见性、权限拒绝
- `design.md` — 11 项决策，每项带被否决的替代方案；含 4 个待确认的 Open Question
- `tasks.md` — 8 组 / 48 项任务，每组末尾带类型检查命令与 spec 场景走查

## 实测发现（需要口径）

九段色带相邻两两不同色，「9 模块」划分成立；**但第 7 段 `#F5F4F1`（产品矩阵入口）与第 8 段 `#F8F5F0`（最新资讯）差值仅 3/255，肉眼近乎不可分**，按「颜色变化为分界」严格看视觉上是 8 段。本 change 默认在第 7 段补 `border-top: 1px solid var(--ink-100)`（写在组件 scoped 内，不动全局 CSS）来拉开分辨，替代方案与理由见 D1，是否改走纯间距待定。

## 明确排除

- 拖拽画布、区块模板库、跨页复制、批量多选（`decoration-editor-toolkit`）
- 撤销/重做栈、具名多插槽、容器嵌套容器（首期 `accepts` 只放基础元素）
- 像素级自由定位、内联样式编辑、第三方低代码引擎（TinyEngine / LowCodeEngine / GrapesJS）
- 首页之外的四个导航页组件化、SEO 渲染架构（CSR→SSG）

## 落地状态与校验说明

- 本 change 为规划件，**尚未开始实现**（tasks 全部未勾）。
- 本机 `openspec` CLI 不可用（`which openspec` 未命中），artifact 按仓库既有 change 的目录结构手工产出，**无法复跑 `openspec validate`**；验收时以「需求—场景—任务」三方人工对照替代。
- 破坏性变更只有一处（区块结构 1→2 可嵌套），上线顺序硬约束见 D5 与 tasks 8.5：先部署递归渲染，再允许编辑器产出嵌套内容。
