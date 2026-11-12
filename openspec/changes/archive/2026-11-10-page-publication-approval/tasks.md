## 1. 数据迁移

- [ ] 1.1 新增 `backend/sql/migrations/008_page_workflow.sql`：`pages.review_status`（默认 `draft`，CHECK 限四值）与 `pages.approved_version_id`（FK，可空）
- [ ] 1.2 建 `page_versions` 表：`UNIQUE(page_id, seq)`、`stage`/`source` CHECK、`blocks jsonb`、`meta jsonb`、`ON DELETE RESTRICT`、`(page_id, created_at DESC)` 索引
- [ ] 1.3 建 `page_reviews` 表与 `(page_id, created_at DESC)`、`actor_id` 索引
- [ ] 1.4 为每个 `status=1` 的页面补 `seq=1, stage=published, source=baseline` 快照，并把该页置 `approved` + 绑定基线快照
- [ ] 1.5 角色种子补 `reviewer`，并给 `editor` 增加 `content:publish`（`super_admin` 已有 `*`）
- [ ] 1.6 同步 `backend/sql/schema.sql` 的建表与种子，保证全新环境一次建好；附反向脚本注释

## 2. 后端：状态机与权限

- [ ] 2.1 `config.ts` 增加 `publication.selfApprove`（读 `PUBLICATION_SELF_APPROVE`，默认 false）
- [ ] 2.2 新增 `backend/src/lib/pageWorkflow.ts`：合法迁移表、`requirePerm` 组合、错误消息常量
- [ ] 2.3 `POST /pages/:id/submit`：校验 `draft_json.blocks` 非空 → 生成 `submitted` 快照（`FOR UPDATE` 取 `seq`）→ 置 `pending` → 写 `page_reviews(submit)`
- [ ] 2.4 `POST /pages/:id/withdraw`：仅提交人或持 `content:review` 者可将 `pending` 撤回为 `draft`
- [ ] 2.5 `POST /pages/reviews/:versionId/approve`：要求 `content:review`、状态为 `pending`、职责分离校验（含 `selfApprove` 放宽与标记）→ 置 `approved` + `approved_version_id`
- [ ] 2.6 `POST /pages/reviews/:versionId/reject`：要求 `content:review`、意见必填 → 置 `rejected`
- [ ] 2.7 改造 `PUT /pages/:id/draft` 与 `PATCH /pages/:id`：内容或 meta 变更一律重置 `review_status=draft`、清空 `approved_version_id`，`pending` 时响应带 `withdrawn: true`
- [ ] 2.8 改造 `POST /pages/:id/publish`：要求 `content:publish` + `review_status=approved`；内容来源改为已批准快照；生成 `stage=published` 快照；非法状态返回 409 与可读原因
- [ ] 2.9 改造 `POST /pages/:id/unpublish`：要求 `content:publish`；`slug=home` 需请求体带显式确认标记，否则 400
- [ ] 2.10 上述全部动作补写 `audit_logs`（action 前缀 `page.`），并新增 `GET /pages/:id/reviews`
- [ ] 2.11 `GET /pages` 与 `GET /pages/by-slug/:slug` 返回 `review_status`、`approved_version_id`、待办计数（`review_status=pending` 总数）

## 3. 后端：版本与回滚

- [ ] 3.1 `GET /pages/:id/versions`：分页返回序号、时间、操作人姓名、`stage`/`source`、区块数量
- [ ] 3.2 `GET /pages/versions/:versionId`：返回完整 `blocks` 与 `meta`（用于预览）
- [ ] 3.3 `POST /pages/:id/rollback/:versionId`：单事务写入 `rollback` 快照 + 覆盖 `content_json`/`draft_json`/meta + `status=1` + `approved` 绑定 + 留痕
- [ ] 3.4 确认不暴露任何版本 UPDATE/DELETE 路由（快照只增不改不删）
- [ ] 3.5 `errors.ts` 补业务码：状态冲突、无批准记录、职责分离拒绝、首页下线未确认

## 4. 前端：装修编辑器工作流

- [ ] 4.1 `api/cms.ts` 增加 `submit/withdraw/approve/reject/reviews/versions/rollback` 方法，`types/cms.ts` 增加 `PageVersion`、`PageReview` 与页面状态字段
- [ ] 4.2 编辑器顶栏改为状态条：审核状态徽标 + 线上状态 + 「草稿未发布」提示，沿用既有 dirty 标记
- [ ] 4.3 动作按钮按「状态 × 权限」渲染：保存草稿 / 提交审核 / 撤回 / 批准 / 驳回（弹窗必填意见）/ 发布 / 下线
- [ ] 4.4 批准与驳回按钮对提交人自身禁用（前端预校验，服务端仍强制）
- [ ] 4.5 首页下线确认改为需输入指定确认文字，提示官网首页立即 404
- [ ] 4.6 保存草稿收到 `withdrawn:true` 时提示「已自动撤回审核，需重新提交」

## 5. 前端：页面列表与历史抽屉

- [ ] 5.1 页面列表增加「审核状态」列与筛选，`pending` 待办计数徽标显示在菜单项上
- [ ] 5.2 列表操作列按状态提供合法动作入口（提交/批准/发布/下线），无权限时置灰并提示所需权限点
- [ ] 5.3 新增历史抽屉：时间线列表 + 「预览此版本」用 `SectionRenderer :preview="true"` 只读渲染快照
- [ ] 5.4 回滚按钮二次确认，明确「紧急通道，跳过审批立即生效」，成功后刷新页面数据与官网缓存（`ensureLoaded(true)` 如涉及站点配置）
- [ ] 5.5 审批轨迹区块：展示 `page_reviews`（含自批标记与驳回意见）

## 6. 验证与交付

- [ ] 6.1 走查 `page-publication` 全部场景（未批准发布被拒、状态迁移非法组合、编辑使批准失效、职责分离、权限拒绝、留痕可查、首页下线确认）
- [ ] 6.2 走查 `page-versioning` 全部场景（发布产生快照、快照不可改、预览不影响线上、回滚立即生效并留新快照、存量页基线快照）
- [ ] 6.3 backend `npx tsc --noEmit` 与 buinessweb `npx vue-tsc --noEmit` 通过
- [ ] 6.4 在 `docs/service-design/` 补一节发布流程说明：三步流程、角色分工、`PUBLICATION_SELF_APPROVE` 使用条件
- [ ] 6.5 记录回滚方案：前端 `git revert` + 008 反向 SQL，并确认反向执行不影响线上内容
