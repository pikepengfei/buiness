# decoration-editor-toolkit

装修器效率增强：区块拖拽排序、复制、跨页复用、区块模板库与批量操作。**代码已交付（2026-11-12）**：迁移 `014_block_templates.sql`（+ 同号 rollback）、模板 CRUD 与跨页复制接口、编辑器拖拽 / 批量 / 复制、模板库标签页及配套单测；剩浏览器侧人工验收（`docs/装修编辑器验收清单.md` B 部分）与环境性 CLI 校验。2026-11-10 已按前置交付的「组件库右侧抽屉 + 三栏结构」整体重写，消除过时落点。

## 在全链路中的位置

原计划排在 `page-publication-approval` 之后；该审批工作流已于 2026-11-10 弃做归档（`archive/2026-11-10-page-publication-approval`）。现排在 **`component-library-standalone`（组件库右侧抽屉单形态 + 编辑器三栏重构）之后**：组件库已从左栏移入编辑器右侧可单独打开的抽屉，左栏是纯页面结构树；本 change 的拖拽把手搭在这棵递归树上，模板库作为抽屉的**第二个标签页**接入，模板缩略直接复用 `LibraryCard` 真实渲染。组件库不是独立路由页。数据模型 `{id,type,visible,props,children?}`（结构版本 2）与前台渲染均不改动，不依赖路由迁移，只依赖「发布才可见」与「组件库抽屉已就位」。

## 与抽屉化架构的衔接（本次重写的 13 处）

| # | 旧稿口径 | 当前事实 / 本版处理 |
| --- | --- | --- |
| 1 | 左栏平铺「区块列表」 | `treeRows` 递归结构树，带 `depth` / 折叠 / 子内容 |
| 2 | 拖拽可任意换序 | 限定**同层同父**，跨父拖移拒绝（避免破坏 `canAccept` 与嵌套上限） |
| 3 | 新增 `duplicateBlock(block)` | `blocks.ts` 已有 `duplicateTree(node, taken)`（整树、唯一 id、含 `children`），直接复用 |
| 4 | `genBlockId` 生成副本 id | 改用 `uniqueBlockId(type, collectIds(tree))` |
| 5 | 「新增区块弹窗」补模板标签页 | 弹窗已不存在；模板库 = 组件库抽屉 `el-tabs` 第二页 |
| 6 | `BlockTemplatePanel` 独立弹窗 | 挂在抽屉内，不新增弹窗 / 路由 / 第四栏 |
| 7 | 模板缩略「复用 LibraryCard」但无路径 | `LibraryCard` 加可选 `blocks?: Block[]`，模板传自身内容，组件库不传则零变化（唯一代码接缝） |
| 8 | 迁移 `009_block_templates.sql` | 改 **`014`**（现有 002–006 / 010–013；008 属弃做审批工作流、009 空号，不回填） |
| 9 | 跨页复制两个 API 路径并存 | 统一 `POST /pages/:targetSlug/blocks/copy` |
| 10 | 已保存可从历史快照回滚（`page-versioning`） | `page_versions` 从未落地，改为「已保存后只能手动重装修或重新发布修正版本」 |
| 11 | `MEDIA_REF_TARGETS` 4 张表 | 实际 6 张（含 `article_drafts` / `product_drafts`），D8「模板不进扫描」结论不变 |
| 12 | 多选取代单选 | `selPath: number[]` 仍是主选中，`selectedIds` 只服务批量动作 |
| 13 | 无结构护栏 | 新增 `checkInsert` / `validateTree` / `BLOCK_LIMITS` 统一护栏，服务端复制独立校验 |

## 关键交付物

- `specs/block-decoration/spec.md` — **9 项要求 / 27 个场景**：排序、复制、跨页复用、模板、默认内容、兼容保护、批量操作，新增「模板库接入组件库抽屉」「新增写入遵守结构护栏」
- `design.md` — **11 项决策**：原生 DnD 且同层同父、复用 `duplicateTree`、跨页复制行锁、模板表 014、props 兼容合并、`defaultBlocks`、双选中态、模板不进素材扫描、体积上限、抽屉第二标签页 + `LibraryCard` 接缝、统一结构护栏
- `tasks.md` — **42 项任务，8 组**（§0 前置衔接已打勾 1 项；主体 41 项未开工）
- `docs/装修编辑器验收清单.md` — 统一验收清单（A 前置抽屉交付 / B 本 change / C 命令 / D 签收）

## 与前置 change 的唯一代码接缝

`LibraryCard.vue` 目前固定渲染 `libraryDemoBlocks(type)`（注册表默认骨架）。模板缩略要显示模板自身内容，需新增可选 prop：

```ts
const demo = computed(() => props.blocks ?? libraryDemoBlocks(props.item.type));
```

组件库调用方不传 `blocks`，既有面板单测与全量单测行为零变化。该改造列为 `tasks.md` §0.2，连同 §0.3 的 tabs 一起作为本 change 开工第一步（已于交付时落地）。

## 跨 change 接缝登记（C5，执行时记录）

- **`site-runtime-link-integrity`（007 号预留）**：其 `rewrite-detail-links.ts` 目前只扫 `pages` 的 `draft_json` / `content_json`。`block_templates.props` 里可能存有指向旧 slug（如 `/products/x`）的链接，模板**不会**被该重写逻辑覆盖——区块插入页面后，落进 `pages` 草稿的那份会被扫到，模板本身残留旧链接只影响下次插入的新副本。该 change 落地时需决定：模板 props 是否纳入链接重写目标，或接受「模板快照不跟随站内改链」的口径并在其方案中登记本接缝。
- **`component-library-standalone`**：`LibraryCard` 可选 `blocks` prop 已落地（本 change 唯一对其代码的改动），其验收清单 A 部分回归时 B8.3（组件库标签页零变化）须一并复验。

## 明确排除（按你的选择）

- 全局共享区块（一处修改全站生效）——需要引用模型与失效传播，另案
- 撤销/重做栈、区块跨父自由拖移与嵌套分组编辑、页面级模板一键铺页、模板审核与个人可见范围
- 定时发布、发布审批、版本快照回滚（均已随 `page-publication-approval` 弃做归档）
- 独立模板库路由页、后台菜单新入口、常驻第四栏
