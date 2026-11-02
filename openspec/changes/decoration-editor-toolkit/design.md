## Context

装修器三栏（左区块列表 / 中表单 / 右预览）已具备：`moveBlock`/`removeBlock`/`insertBlock`/`genBlockId` 等纯函数（[buinessweb/src/website/blocks.ts:32-55](../../../buinessweb/src/website/blocks.ts)）、按 `sectionRegistry.formSchema` 通用渲染的 `BlockForm`、`deep watch → dirty` 的保存触发，以及右侧 `SectionRenderer :preview="true"` 的只读预览。

约束与既有事实：

- 没有任何拖拽依赖（`buinessweb/package.json` 无 sortable/draggable 类库）
- `pages` 的内容是 JSONB 整份覆盖（`PUT /pages/:id/draft`），没有行级 `/pages/reorder`（`registerReorder` 只注册了 banners/faqs/menus/分类）
- `SECTION_REGISTRY[type].defaultProps` 是**函数**，字段会随注册表演进
- 素材删除的引用扫描目标是 `[pages, products, articles, banners]`（[content.ts:59-62](../../../backend/src/routes/content.ts)）
- 前端整份覆盖草稿的写法在并发下会丢失更新——本 change 引入跨页写入后必须处理

## Goals / Non-Goals

**Goals:**

- 顺序调整、复制、复用从「多次点击 + 手抄」变成一次拖拽/一次选择
- 模板成为可积累的资产，新页面起步时间显著缩短
- 任何新增写入路径都不破坏 `page-publication` 的审核闸门

**Non-Goals:**

- 不做全局共享区块（一处改全站生效）——用户明确排除，且需要引用模型与失效传播，复杂度另案
- 不做撤销/重做栈（`Non-Goal` 与 spec 一致：靠「放弃草稿」回退）
- 不做区块嵌套/容器分组
- 不做模板审核与个人/团队范围隔离
- 不改渲染层与前台行为

## Decisions

### D1 拖拽用原生 HTML5 DnD，不引入依赖

只在左栏把手上开 `draggable`，`dragstart` 记录被拖 `block.id`（同时 `dataTransfer.setData('text/plain', id)` 以满足 Firefox），行上 `dragover.prevent` + 插入指示线，`drop` 调 `moveBlock` 语义的不可变替换。

替代方案：`vuedraggable`/Sortable.js（触屏、自动滚动、跨列表更省心，但新增依赖与约数十 KB 体积，且本后台以桌面为主）。上下移按钮**保留**，同时作为触屏与键盘的等效路径——满足 spec 的「拖拽与按钮结果一致」。

### D2 复制是深拷贝，不留关联

`JSON.parse(JSON.stringify(block))` + `genBlockId(type)`，插入到源之后。刻意不做引用型区块：引用模型要解决级联删除、失效渲染与预览一致性，属于被排除的全局共享区块范畴。

### D3 跨页复制走服务端，绕开整份覆盖

新增 `POST /pages/:targetSlug/blocks/copy`，body `{ sourcePageId, blockIndex, targetIndex? }`。服务端在单事务内 `SELECT draft_json ... FOR UPDATE` → 追加/插入副本 → 写回 → 重置审核状态并返回目标页区块数。

为什么不在前端「读目标草稿 → 改 → PUT」：那条路径必然与 `PUT /pages/:id/draft` 的整份覆盖语义冲突，两人同时操作时后写者会静默丢掉前者的改动；服务端加行锁是唯一可靠的写法。审核状态重置必须在服务端做，避免前端漏网（与 `page-publication` D2 同源规则）。

### D4 模板入库：`block_templates`

```
block_templates(id, name, type, props jsonb, created_by, created_at, updated_at)
  UNIQUE(name, type)
```

接口 `GET /block-templates`（关键词 + 类型过滤 + 分页）、`POST`、`PATCH /:id`、`DELETE /:id`，读写权限沿用 `content:write`。

替代方案：塞进 `site_settings` 的某个 JSON 键（无法分页、检索与并发更新，且语义错位）。删除权限取「任何有写权限者可删 + 二次确认」：模板不是线上内容，误删影响面是「下次插入少了个选项」，不值得为它设计归属与审批。

### D5 插入时做 props 兼容合并

`mergeBlockProps(type, props)`：以 `SECTION_REGISTRY[type].defaultProps()` 为底，覆盖模板提供的字段（`list`/`object` 整体覆盖，不做元素级 diff）。`type` 不在注册表中的模板标记 `unavailable`，插入入口隐藏、管理列表保留以便清理。这样注册表演进不会让历史模板炸表单。

### D6 「铺入默认内容」复用 `pageDefaults`，与 C1 呼应

`DEFAULT_BLOCKS` 按 slug 组织的五套默认区块继续作为**数据源**（C1 已把它移出前台渲染路径）：编辑器在草稿为空或运营主动选择时追加填入。只对存在默认集的 slug 显示该入口，自定义新页面不提供。

### D7 选择集用 `block.id`，不用索引

拖拽、删除、插入都会改变索引，选择态若按索引保存必然错位。统一 `selectedIds: Set<string>`，需要索引时从当前数组即时计算。

### D8 模板不参与素材引用扫描（明确不做）

模板里的图片 URL 只是「将来可能被复制进页面的候选值」，不构成线上引用；一旦区块被插入到页面，引用关系已由 `pages` 行被 `MEDIA_REF_TARGETS` 覆盖。因此不把 `block_templates` 加入扫描目标——加了只会让素材库出现无法点击的幽灵引用。

### D9 模板体积与条数上限

`props` 序列化后 ≤ 256KB、`list` 类字段条目 ≤ 200，用 zod 在服务端拒绝（`rich-text` 的 `html` 是最可能撑大的字段）。前端给出对应提示，避免把大对象灌进 JSONB 后拖慢整页加载。

## Risks / Trade-offs

- [原生 DnD 浏览器差异（Firefox 需 `setData`、Safari 拖影）] → 显式设置拖拽数据 + 视觉插入线不依赖 drag image；保留上下移按钮作为兜底
- [拖拽与 `deep watch` 交互导致预览闪烁或 dirty 抖动] → 顺序变更走不可变数组替换、预览 `:key` 用 `block.id`（现状已满足），改动只做一次赋值
- [跨页复制是「副本」，源页面后续修改不会同步] → UI 文案明确「复制的是副本，之后互不影响」；真正的共享需求留给将来的全局区块 change
- [与 `page-publication` 同时改 `editor.vue` 造成冲突] → 实施顺序排在 C2 之后；C3 的改动限制在左栏列表模板、新增 `BlockTemplatePanel.vue` 与 `blocks.ts` 辅助函数，不动顶栏动作条
- [模板数量随时间膨胀、近似重复] → 列表支持按类型过滤与关键词搜索；重名唯一约束迫使命名收敛；不做审核以换取低摩擦
- [批量删除不可撤销] → 确认弹窗显示受影响数量与区块标题清单；未保存时可用「放弃草稿」回退，已保存时可从历史快照回滚（依赖 `page-versioning`）

## Migration Plan

1. `backend/sql/migrations/009_block_templates.sql`（仅新增表，对 `pages` 无改动）
2. 后端：模板 CRUD + 体积校验 + `POST /pages/:targetSlug/blocks/copy`（事务 + 行锁 + 审核状态重置）
3. 前端：`blocks.ts` 增加 `duplicateBlock`/`mergeBlockProps`；`api/cms.ts`/`types/cms.ts` 增加模板类型与方法
4. 前端：左栏把手拖拽 + 多选 + 批量操作；新增模板面板（存为模板 / 从模板插入 / 管理）
5. 验证：按 spec 场景逐条走查，重点验证「复制后独立编辑」「目标页并发写入不丢改动」「旧模板缺字段仍可插入」

回滚：`DROP TABLE block_templates;` + `git revert`；`pages` 表结构与线上内容不受影响，已插入到页面的区块是普通副本，回滚后仍正常渲染。

## Open Questions

- 是否需要撤销/重做栈（当前依赖「放弃草稿」与历史快照回滚）
- 模板是否需要「仅创建者可见」范围，或按业务线分组
- 是否需要把整页（多区块）保存为「页面模板」一键铺页——本 change 只做区块粒度
