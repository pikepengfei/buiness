## Context

现状：`pages.status` 是 0/1 的发布开关，`publish` 直接把 `draft_json` 覆盖到 `content_json` 并置 `status=1`（[backend/src/routes/content.ts:168-182](../../../backend/src/routes/content.ts)），只要求 `content:write`；`has_unpublished_draft` 是列表接口的计算列；审计表 `audit_logs(user_id, action, entity_type, entity_id, ip)` 无载荷列（[backend/sql/schema.sql:344-363](../../../backend/sql/schema.sql)）；角色种子只有 `super_admin(*)`、`editor(content:read,content:write,media:write)`、`operator(content:read,lead:*)`。

依赖：本 change 建立在 `site-runtime-link-integrity` 之后——前台「未发布即 404」成立，审核闸门才有意义；快照回滚要立刻反映到官网，依赖页面接口已有的 `no-cache` + ETag 协商缓存。官网前端只有一条非开放地址 `/preview/:slug`（登录门控的草稿预览，读 `draft_json`），本 change 不改它：审批流落地后它仍然表示「将发布的内容」，历史快照的预览走管理端抽屉，不复用该地址。

约束：团队小（当前无独立审核岗）、Postgres 单机、无消息队列与邮件服务。

## Goals / Non-Goals

**Goals:**

- 未批准的草稿在技术上无法上线，而不是靠流程自觉
- 「批准的是哪一版」有客观记录，且发布的正是那一版
- 误发布可在秒级恢复到任意历史内容，且历史不被破坏
- 权限模型能落到现有 RBAC（权限点数组），不引入新框架

**Non-Goals:**

- 不做定时发布/自动上下线（用户明确排除）
- 不做站内消息、邮件提醒或待办推送；只给计数与筛选
- 不做多级审批链（N 级/会签），单级批准即达
- 不做快照清理与归档策略（见 Open Questions）
- 不动产品/资讯/FAQ 等非页面内容的发布流程

## Decisions

### D1 新增 `review_status` 列，而不是扩展 `status` 枚举

`status=1` 的语义在前台查询、编辑器加载、列表计算列中被广泛依赖（`public.ts` 的三处 `WHERE status=1`）。「是否可见」与「流程走到哪」是两个正交状态，合并成一列会让所有既有查询重新审查。新增列 + 默认 `draft` 对旧逻辑零影响。

替代方案：`status` 扩到 0..5（改动面大，易漏）；单独建 `page_workflow` 表（多一次 JOIN，且 1:1 关系无必要）。

### D2 发布以「已批准的快照」为内容来源

新增 `pages.approved_version_id`（FK `page_versions`）。`publish` 不再读 `draft_json`，而是读取被批准快照的 `blocks`/`meta` 写入线上。这样即使「批准后 draft 又被改动」的窗口出现，发布的仍是批准的那一版（与「编辑使批准失效」的要求互为双保险）。

`PUT /pages/:id/draft` 与 `PATCH /pages/:id`（meta）都无条件把 `review_status` 置 `draft` 并清空 `approved_version_id`；对 `pending` 页面这等同于自动撤回，响应中返回 `withdrawn: true` 让前端提示。

### D3 两张新表：`page_versions` 与 `page_reviews`

```
page_versions(id, page_id, seq, stage, blocks jsonb, meta jsonb, note, source, created_by, created_at)
  stage ∈ submitted | published | rollback；UNIQUE(page_id, seq)；无 UPDATE/DELETE 接口
page_reviews(id, page_id, version_id, action, actor_id, comment, created_at)
  action ∈ submit | approve | reject | withdraw | publish | unpublish | rollback
```

状态迁移历史用 `page_reviews` 表达，`audit_logs` 继续只记粗粒度动作——不给共享审计表加载荷列，避免它变成别的模块的隐性依赖。`seq` 通过 `SELECT ... FOR UPDATE` 锁定页面行后取 `max(seq)+1`，防止并发发布产生重复序号。

### D4 权限点：`content:review` 新增，`content:publish` 从宽授予

- `content:write`（已有）→ 编辑、提交审核
- `content:review`（新增）→ 批准、驳回；仅给 `reviewer` 与 `super_admin`
- `content:publish`（新增）→ 发布、下线、回滚；给 `editor`、`reviewer`、`super_admin`

关键取舍：把 `content:publish` 也给 `editor`，看起来削弱了控制，但真正的闸门是「必须存在他人的批准」——`editor` 无 `review` 权限就无法自造 `approved` 状态，因此能发布已批准内容是安全的，并且避免运营团队「改一个字也得等审核人来点发布」。

### D5 职责分离在服务端比较 actor 与提交人

批准时校验 `actor_id != page_versions.created_by`（提交人）。`PUBLICATION_SELF_APPROVE=true` 时放宽，并在 `page_reviews.comment` 前缀写入 `[self-approve:override]` 以便事后追溯。配置项落在 `backend/src/config.ts`，与既有 `config.publicCacheMaxAge` 同层。

### D6 回滚是一步事务的紧急通道

`POST /pages/:id/rollback/:versionId`（需 `content:publish`）在单事务内：写入 `source=rollback` 的新快照 → 更新 `content_json`/`draft_json`/`meta` → `status=1`、`review_status='approved'`、`approved_version_id=新快照` → 记 `page_reviews(rollback)` 与 `audit_logs`。明确允许跳过审批，代价换取事故恢复速度；UI 必须标注该次上线未经审批。

### D7 前端复用现有渲染与表单能力

编辑器顶栏改为状态条 + 合法动作按钮组（按 `review_status`/`status`/权限三元计算，权限判定沿用 `hasPermission`）。历史抽屉用 `el-drawer` + `el-timeline`，预览复用 `SectionRenderer :preview="true"` 渲染快照 blocks——不新增渲染路径，装修器（`decoration-editor-toolkit`）的拖拽改动不会与本 change 冲突。

### D8 迁移 008 让存量页面「可回滚但不免审」

`008_page_workflow.sql`：加列与两表 → 为每个 `status=1` 的页面按 `content_json` 补 `seq=1, stage=published, source=baseline` 快照，并把该页 `review_status` 置 `approved`、`approved_version_id` 指向基线快照 → 种子角色加 `reviewer`。效果：历史能力对存量页面立即可用；而任何后续编辑都会重置为 `draft`，因此新内容一律走审批。

## Risks / Trade-offs

- [单人或小团队没有第二人能批准，内容可能卡在 `pending`] → `PUBLICATION_SELF_APPROVE` 放宽 + 文档写明；后台待办计数让卡点可见
- [迁移后运营发现「发布」按钮变灰，误判为故障] → 编辑器状态条明确显示「草稿需重新提交审核」并给一键提交；发布前在变更说明与 `docs/` 中公告流程变化
- [全量 blocks 快照导致数据增长] → 单页快照约数十 KB 量级，按 100 次发布/页估算仍在单机 Postgres 舒适区；保留与清理策略留待 Open Question，不做预防性截断（截断会破坏「回滚到任意历史」承诺）
- [`approved_version_id` 指向被清理的快照造成悬挂] → 不提供删除接口 + `ON DELETE RESTRICT`，从数据层堵死
- [前后端不同步上线时，旧前端调用 publish 收到 409] → 本 change 的接口改造与前端编辑器改造必须在同一发布窗口
- [自动撤回（保存草稿即撤回 pending）可能与审核人操作竞态] → 批准走快照 id 而非当前状态，若提交已被撤回则 `version_id` 关联的 `withdraw` 记录存在，批准请求返回状态冲突而不是静默生效

## Migration Plan

1. 执行 `008_page_workflow.sql`（加列 + 建表 + 基线快照 + 角色种子），脚本设计为可重复执行
2. 后端发布：新增 `submit/withdraw/approve/reject/rollback` 路由与改造 `publish/unpublish` 校验；`config.ts` 读 `PUBLICATION_SELF_APPROVE`
3. 前端发布：编辑器状态条与动作按钮、页面列表筛选与待办计数、历史抽屉与回滚
4. 培训与公告：向内容团队说明「提交 → 批准 → 发布」三步与谁是 `reviewer`
5. 验证：按两份 spec 的场景逐条走查，重点验证「批准后改一字发布被拒」「回滚后官网立即生效」

回滚：接口与 UI 属新增能力，前端 `git revert` 即可回到旧一步发布；数据侧 `ALTER TABLE pages DROP COLUMN review_status, DROP COLUMN approved_version_id; DROP TABLE page_reviews, page_versions;` 随迁移文件附反向脚本。注意：反向执行不影响 `content_json`/`draft_json`，线上内容不变。

## Open Questions

- 快照保留上限与清理策略（按时间/条数/容量）——需要至少半年真实数据量才能定，暂不实现
- 是否需要待办主动提醒（站内消息/企业微信）——当前只有列表筛选与计数，缺推送
- 是否存在「一次批准多个页面」的批量审批诉求
