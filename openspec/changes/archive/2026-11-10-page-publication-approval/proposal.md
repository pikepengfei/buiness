## Why

现在发布是单人一步动作：谁有 `content:write` 谁就能把草稿直接覆盖线上（[backend/src/routes/content.ts:167-181](../../../backend/src/routes/content.ts) 的 `publish`），没有任何审核痕迹，也发不出「发错了退回去」——一旦把不合适的文案推到官网，唯一的恢复手段是照着记忆重新装修。C1 取消前台兜底之后，误发布/误下线的后果会立刻暴露在官网首页上，这条链路必须先有闸门和后悔药。

## What Changes

- 页面引入独立的审核状态字段 `review_status`（`draft`/`pending`/`approved`/`rejected`），与既有 `status`（是否线上可见）解耦：`status` 语义与所有既有查询不变
- 新增发布工作流：编辑提交审核 → 审核人批准或驳回 → 批准后才能发布；服务端强制校验状态迁移合法性，非法迁移返回明确错误
- **职责分离**：提交人不能批准自己提交的版本（含超级管理员），单人运维场景通过 `PUBLICATION_SELF_APPROVE=true` 放宽
- 新增权限码 `content:review`（批准/驳回）与 `content:publish`（发布/下线/回滚），预置新角色 `reviewer`；既有 `editor` 只保留编辑与提交
- 新增版本快照表 `page_versions`：每次发布冻结一份区块与 meta 快照（append-only），支持任意历史版本的一键回滚（回滚=以该快照生成新草稿并走发布流程，或直接发布，均需 `content:publish`）
- 新增审核记录表 `page_reviews`：留痕提交/批准/驳回的动作、操作人、意见与时间；粗粒度动作同步写 `audit_logs`
- 后台编辑器顶部增加状态条与动作按钮（提交/批准/驳回/发布/下线/历史），历史抽屉可预览任意快照
- 未通过审核的内容在官网永不可见（沿用 `status=1` 作为唯一线上开关，与 C1 的严格 404 对齐）

## Capabilities

### New Capabilities

- `page-publication`: 页面从草稿到线上的状态机、审批权限、状态迁移的错误语义与留痕要求
- `page-versioning`: 发布快照的生成、查询、预览与回滚行为

### Modified Capabilities

（无——`page-routing` 与 `site-navigation` 由 `site-runtime-link-integrity` 首次建立，本 change 不改其要求，仅依赖「未发布即不可见」）

## Impact

- 数据：新增迁移 `backend/sql/migrations/008_page_workflow.sql`（`pages.review_status`、`page_reviews`、`page_versions`、角色与权限码种子、现有已发布页补初始快照）
- 后端：`backend/src/routes/content.ts`（pages 相关接口全部改造）、`backend/src/lib.ts`（状态迁移辅助）、`backend/src/errors.ts`（新增业务码）、`backend/src/config.ts`（`PUBLICATION_SELF_APPROVE`）
- 前端：`buinessweb/src/views/admin/website/pages/editor.vue`、`pages/index.vue`、`buinessweb/src/api/cms.ts`、`buinessweb/src/types/cms.ts`、角色权限页 `views/admin/system/roles.vue`
- 官网前台：无改动（仍只读 `content_json`）
- 流程：内容上线从 1 步变 3 步，需要明确谁担任审核人；无审核人时页面将无法发布
