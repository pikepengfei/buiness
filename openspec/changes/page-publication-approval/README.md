# page-publication-approval

页面发布工作流：`review_status` 状态机 + 双角色审批（职责分离）+ 版本快照与一键回滚。

## 在全链路中的位置

第 2 步，前置依赖 `site-runtime-link-integrity`（必须已有「未发布即 404」，审批闸门才有意义；回滚要即时生效，依赖页面接口的 `no-cache`+ETag）。

## 关键交付物

- `specs/page-publication/spec.md` — 状态机、权限、职责分离、留痕、首页下线保护（8 项要求 / 19 个场景）
- `specs/page-versioning/spec.md` — 快照生成、不可变性、预览与回滚（4 项要求 / 10 个场景）
- `design.md` — 8 项决策：为何新增列而不改 `status`、发布内容取自「已批准快照」而非 draft、两表分工、`content:publish` 为何仍给 editor、回滚作为紧急通道等
- `tasks.md` — 38 项任务，分 6 组

## 需要业务侧先确认的事

- 谁担任审核人（`content:review`）；没有第二人时上线会卡住，需按 `design.md` D5 启用 `PUBLICATION_SELF_APPROVE`
- 定时上下线已按你的选择排除，若后续要做，属于新 change
- 存量已发布页在迁移后置为「已批准并绑定基线快照」，因此历史回滚立即可用，但任何新改动都需重新审批
