## 1. 公共组件文件夹与基础元素（先落地的一块）

- [x] 1.1 新建 `buinessweb/src/components/ui/`，与既有 `src/components/empty/` 同级；建 `index.ts` 统一导出
- [x] 1.2 `UiText.vue`：段落/行内两种形态，props `text|html`、`tone`（正文/次级/反白）、`size`；样式自带 scoped，仅引用 `--ink-*` 变量（D9）
- [x] 1.3 `UiHeading.vue`：吸收 `SecHead.vue` 的眉标+主标题（多行 `<em>` 高亮）+描述逻辑，保持现有 DOM 类名与视觉不变（D10）
- [x] 1.4 `UiImage.vue`：`src/alt/ratio/fit/radius`，`src` 为空时不渲染破损图并输出管理端提示类（对应 spec「图片缺少地址」场景）
- [x] 1.5 `UiButton.vue`：三态 `solid|ghost|ghost-light`（对齐 `.hero` 与 `.cta-banner` 现用法），`to` 支持站内路径/锚点/`mailto:`/`tel:`，非法地址在编辑态给出校验提示（对应 spec「跳转地址不合法」）
- [x] 1.6 `sections/SecHead.vue` 改为转发 `UiHeading` 的薄组件，14 处调用点不改（D10）
- [x] 1.7 为四个基础元素补组件单测：`UiButton` 三态类名与链接形态、`UiImage` 空地址、`UiHeading` 多行与 `<em>` 转义、`UiText` html 分支不放宽标签
- [x] 1.8 验证：`cd buinessweb && npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`；`pnpm test:unit`；浏览器打开 `/` 与 `/about` 截图比对，确认标题呈现与改造前逐像素一致
      * 口径更正（补记于 8.3/8.4 走查时）：本环境的截图始终取不到（Qoder 内置浏览器视口隐藏，`take_screenshot` 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`），**「逐像素比对」并未实际发生**，不能算已验收。1.8 实际取得的证据是：`vue-tsc` 无输出、组件单测覆盖 `UiHeading` 的类名与 `<em>` 转义、`SecHead` 转发后 14 处调用点类名不变（`.sec-head/.eyebrow/.sec-link` 同名保留）；像素级回归留待 8.4 的类名盘点替代，如需真正的视觉比对要在可视浏览器里重跑

## 2. 首页九模块登记与模块改用基础元素

- [x] 2.1 注册表为九个首页模块补 `layer: 'module'`、`band`（背景来源，D1）与 `accepts: ['atom']`（首期只允许装载基础元素，容器套容器禁用）
- [x] 2.2 `SecHero` 的两处按钮与首屏图片改调 `UiButton`/`UiImage`/`UiText`
- [x] 2.3 `SecCtaBanner`、`SecPmEntry` 的按钮改调 `UiButton`（`.cta-banner .btn` 的 `position: relative; z-index: 1` 以 `SecCtaBanner` scoped `:deep(.ui-btn)` 等价保留）
- [x] 2.4 `SecFeatureProducts`、`SecProductGrid`、`SecNewsFeed`、`SecPosterGrid` 的按钮与图片改调基础元素（`SecStory` 图片同）
- [x] 2.5 【实现中修正】第 7 与第 8 段之间不需要新增分隔线：实测第 7 段（`pm-entry`）与第 9 段（`cta-banner`）的底色落在**带 1px `--ink-100` 描边的卡片**上而非通栏，卡片与相邻通栏段本就有可见分界；「3/255 不可分辨」是拿卡片底色和相邻通栏底色对比造成的误判。改由注册表 `band.form: 'bleed' | 'card'` 承载边界判据并在编辑器显示（见 D1 修订）
- [x] 2.6 全仓 grep 确认九模块内不再残留手写的 `class="btn`（其余页面允许保留，属 D9 已知代价并在文档标注）—— `src/website/**` 已无 `class="btn"` 与裸 `<img>`；残留 14 处全部位于 `views/website/{Search,NotFound,news/detail,products/detail}.vue`
- [ ] 2.7 验证：类型检查同 1.8；浏览器走 spec 场景「同一按钮样式跨模块一致」——首屏实心按钮与尾部 CTA 幽灵按钮的字号/内边距/圆角 computed style 一致；「单个模块独立显隐」——把 `home-products` 置 `visible:false` 发布后官网跳过该段且其余八段不变
      * 进度：类型检查通过；按钮等价已用「同页注入 `.btn.btn-primary` 参照物比对 computed style + 盒尺寸」验证（17 项属性零差异、rect 一致）。「模块独立显隐」需登录后台发布，随 8.2 一并走查，故本项尚未完成。

## 3. 嵌套数据模型与递归渲染

- [x] 3.1 `website/blocks.ts`：`Block` 增可选 `children?: Block[]`；`CURRENT_BLOCK_SCHEMA_VERSION` 升 2；新增 `v1→v2` 迁移（补 `children` 缺省、剔除内部版本标记），确认幂等
- [x] 3.2 `parseBlocks` 逐层递归解析并跑迁移；未注册 `type` 在**每一层**都被跳过（不只是顶层）
- [x] 3.3 `SectionRenderer.vue` 改递归分发：逐层过滤 `visible===false` 与未注册类型，向子层透传 `preview` 与深度；空内容模块整段不渲染（spec「模块内容为空」）
      * 实现细节：「空内容」判定改为 `hasOwnContent(模块自身文案) || 子层有可渲染节点`，替换原 `isBlockEmpty`（子内容全部隐藏时不再渲染出空壳段）；子内容经默认插槽落进模块版式，外层多出一层无样式 `.section-renderer` 包裹 div
- [x] 3.4 新增纯函数：`countNodes(blocks)`、`maxDepth(blocks)`、`insertChild(parentId, node)`、`duplicateTree(node)`（整树重生成标识）、`trimByLimits(blocks, {depth,nodes,perParent})`
- [x] 3.5 单测：老结构（无 `children`）升级后渲染结果等价；`v1→v2` 二次执行为恒等；深度 5 被裁剪并报告路径；未注册类型出现在子层时的跳过行为
      * `src/website/blocks.spec.ts` 24 项 + 新增 `src/website/SectionRenderer.spec.ts` 7 项（含「子层未注册类型被跳过」「空壳模块整段不渲染」「历史数据渲染等价」）；全量 61 项通过
- [x] 3.6 部署顺序护栏（D5）：编辑器读取「渲染器支持的结构版本」常量，低于 2 时禁止保存带 `children` 的内容并给出原因；该护栏写进发布 checklist
      * `blocks.ts` 新增 `hasNestedChildren` / `nestedSaveGuardMessage`，`editor.vue` 的 `saveDraft` 在调接口前拦截（发布流程复用同一函数，故一并受护）；checklist 落在 `docs/前端执行文档.md` §7「发布前检查（区块结构版本相关）」；顺带把顶层「添加区块」弹窗过滤掉 `layer:'atom'` 项（基础元素不得插到页面顶层，改由第 4 组的组件库面板装载）
- [x] 3.7 验证：`pnpm test:unit`（迁移与递归函数）+ `npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`；浏览器在库里放一个改造前的历史页面 JSON（不含 `children`）访问首页，走 spec「历史页面直接渲染」与「历史数据缺少子内容字段」
      * 库里现存内容即改造前结构：`GET /api/public/pages/{home,about,products,news,contact}` 的 `content_json` 均无 `children` 键；`/` 渲染出 9 个顶层段、`/about` 5 段，控制台零警告零报错（仅内网 iconfont 超时，属既有环境问题）。类型检查通过。嵌套内容的浏览器走查需登录后台放草稿，随 4.x 面板接入后在 8.2 一并完成，本组先由组件级 DOM 测试覆盖

## 4. 组件库面板与插入约束

- [x] 4.1 新增 `views/admin/website/components/ComponentLibraryPanel.vue`：两段（模块 / 基础元素），支持搜索与缩略；数据源为注册表 `layer`
      * 模块段数据源为 `SECTION_GROUPS` 分组 + 未标 `layer` 的历史类型（按 module 处理），基础元素段取 `ATOM_GROUP`；缩略为纯 CSS 示意（模块画色带 / 卡片描边，文字·标题·图片·按钮各画极简图形），不引入图片资源
- [x] 4.2 编辑器接入：替换现「新增区块」弹窗（`editor.vue:299-308`）为常驻面板；插入位置遵循「选中项之后」，与现 `addBlock` 语义一致
      * 弹窗与其样式已删除，左栏改为「组件库 + 页面结构」两段；模块插到页面顶层选中项之后，基础元素插到宿主模块子内容末尾
- [x] 4.3 插入约束：依据 `accepts`/`allowedIn` 禁用不可用项并显示原因（spec「插入到不允许的位置」）；只读权限下全项禁用且不进脏状态（spec「无编辑权限的运营浏览组件库」）
      * 原因分三层：无写权限 / 未选中可装载模块 / 该模块不接受（数据驱动或首期未开放子内容位），逐条写在禁用项下方；只读账号下 `dirty` 不再由 watch 置位，保存·发布·下线·放弃草稿按钮全部禁用，读接口失败时禁止保存（不回落内置默认）
- [x] 4.4 数量/深度上限前置校验：插入前用 `countNodes`/`maxDepth` 试算，超限拒绝并提示已达上限（spec「超过数量上限」「超过深度上限」）
      * 面板用 `checkInsert` 试算置灰，编辑器 `insertFromLibrary` 再试算一次并 `ElMessage.warning`；保存前统一跑 `validateTree`，超限拒绝并给出 `blocks.N.children.M` 形式的位置
- [x] 4.5 编辑器树形显示：模块行可展开子内容、层级缩进、选中层级面包屑；子内容支持删除与上下移（沿用 `moveBlock` 等价语义，不做拖拽——D8）
      * 选中态由 `selIdx` 改为路径 `selPath: number[]`，`blockAt/moveRow/removeRow` 均按路径工作；带子内容的模块在载入时自动展开；未注册类型行标注「类型已下线」并给出删除引导；可改背景但未设定背景的模块标注「背景未指定」
- [x] 4.6 右栏预览：节点数 > 120 时折叠未选中模块（D Risks 项），并记录一次 400 节点页面的渲染耗时作为基线
      * 折叠实现为把未选中模块的 `children` 摘掉后交给渲染器，并在预览上方给出提示条；400 节点基线：happy-dom 下 `mount(SectionRenderer)` 约 **102ms**（`SectionRenderer.spec.ts` 门槛 4000ms，只用于发现量级劣化；浏览器真实基线随 8.2 走查记录）
- [x] 4.7 验证：走 spec「把基础元素插入模块内」「把模块插入页面顶层」「连续快速插入」「重复保存不增加节点」四场景；`npx vue-tsc --noEmit -p tsconfig.vitest.json --composite false`
      * 四场景 + 「插入到不允许的位置」「只读浏览」「超限保存被拒」「背景未指定标注」「预览折叠」共 8 项由 `editor.spec.ts`（mock `@/api/cms` 与 vue-router）覆盖，面板自身 10 项由 `ComponentLibraryPanel.spec.ts` 覆盖；全量 80 项通过，类型检查通过。浏览器内登录后台的人工走查仍需账号，安排在 8.2
      * 附带改动：`vitest.config.ts` 增加 `server.deps.inline: ['element-plus']`，否则按需样式在 node 侧报 `Unknown file extension ".css"`


## 5. 后端递归校验与上限

- [x] 5.1 `backend/src/routes/content.ts:27-34` `blocksSchema` 改递归（`z.lazy`），保留 `id/type/visible/props` 既有约束；新增 `maxDepth=4`、`maxNodes=400`、`children≤50`
      * 校验从路由里抽出为 `backend/src/blocks.ts`（`blockNodeSchema` 用 `z.lazy` 递归、`BLOCK_LIMITS` 与前端 `website/blocks.ts` 同值、`content.ts` 改 `import { deepSanitize, validateBlocks } from '../blocks.js'`）；深度/总数 zod 表达不了，由 `blockLimitIssues` 遍历复核，`maxChildren=50`/`topBlocks=200` 仍由 zod `.max()` 承担
      * `z.ZodType<BlockNode>` 直接标注会因 `.default()` 让输入多出 `undefined` 而报错，改为 `z.ZodType<BlockNode, z.ZodTypeDef, unknown>`
- [x] 5.2 错误消息路径化到子层（如 `blocks.6.children.2.props`），HTTP 400 / 业务码 1001 不变
      * zod 失败取 `error.issues[0].path` 拼路径；上限复核输出 `blocks.0.children.0.children.0…：嵌套深度超过 4 层`。实测三类拒绝的报文：超深 → `blocks.0.children.0.children.0.children.0.children.0：嵌套深度超过 4 层`；子节点缺 `type` → `（blocks.0.children.0.type）`；子内容 51 项 → `（blocks.0.children）`；均为 HTTP 400 + `code: 1001`
- [x] 5.3 确认 `deepSanitize` 递归覆盖 `children` 内的富文本叶子（补一条单测断言，不改实现）
      * 后端无测试运行器，改为自查脚本 `backend/scripts/verify-blocks.ts`（`npx tsx scripts/verify-blocks.ts`，5 组断言全通过）：children 三层里的 `<script>`/`onerror`/`onmouseover` 全部被清洗、非字符串叶子（`src`）不被误改、正常树解析后 `children` 保留、超深/超量/非法子节点均拒绝且消息带路径
      * HTTP 侧同样验证：`PUT /pages/:id/draft` 存入 `<p onerror=alert(1)>校验标题</p>` 与 `<script>alert(2)</script>子内容` 后，`GET /pages/:id` 回读 `draft_json` 为 `<p>校验标题</p>` 与 `子内容`，且 `children` 结构完整
- [x] 5.4 权限沿用 `content:write`；无权限提交结构变更返回权限不足且草稿不变（spec 场景）
      * `write = [authPreHandler, requirePerm('content:write')]` 与 `PUT /pages/:id/draft` 的 preHandler 均未改动；未鉴权提交实测 `401 {code:2001, message:"未提供认证令牌"}` 且草稿不变。带 `content:read` 的账号（editor 之外）拒绝路径需真实低权限账号，与 8.2 的人工走查一并进行
- [x] 5.5 验证：`cd backend && npx tsc --noEmit`；用构造的超深 JSON 与非法子节点 JSON 各发一次 `PUT /pages/:id/draft`，断言 400 与路径消息；正常树保存后 `GET /public/pages/home` 能取回
      * `npx tsc --noEmit` 无输出通过。接口验证脚本走 `POST /pages` 建临时页 `__blocks-verify` → 四组 PUT → 回读 → `DELETE /pages/:id` 清理，未触碰 home 草稿；`GET /public/pages/home` 返回 200 且 `content_json.blocks` 为线上九段（脚本为一次性验证，未入库；断言口径固化在 `scripts/verify-blocks.ts`）
      * 注意请求体口径：`PUT /pages/:id/draft` 收 `{ contentJson: { blocks: [...] } }`，直接把 `{blocks}` 当 body 会被 `z.object({contentJson})` 判为缺字段

## 6. 数据种子与回滚（成对）

- [x] 6.1 新增 `backend/sql/migrations/013_home_module_seed.sql`：仅当 home 页 `content_json` 与内置默认结构等价时写入新模块划分（D11）；否则跳过并 `RAISE NOTICE` 提示
      * 实测「新模块划分」与内置默认**同构**（都是 9 段、`id`/`type` 与顺序不变；改造只往注册表加 `layer/band/accepts` 元数据），所以脚本的写入退化为达标判定 + 版本标记，不做无意义的整份重写：等价 → 只把 `schema_version` 置 2；不等价 → 一行不改并 `RAISE NOTICE` 说明运营已编辑、由前端 `parseBlocks` 读取时升级
      * 默认划分字面量直接取 `002_page_blocks.sql` 第 21–115 行的 home 种子（同 9 段），已用 `pg` 比对：本机 `content_json` 与 `draft_json` 都与该字面量等价（JSONB 相等，键序无关），故本机执行走「等价」分支
      * 草稿口径：空草稿不种默认值——编辑器回落规则是「`draft_json={}` 则用线上内容」，种一份与线上一致的草稿会把页面变成「有未发布改动」，还会绕过 `POST /pages/:id/publish` 的空草稿护栏
      * `SELECT ... FOR UPDATE` 与并发保存草稿互斥；`schema_version` 列存在性用 `information_schema.columns`（限定 `table_schema='public'`）判定，列缺失时只提示不报错
- [x] 6.2 新增 `013_home_module_seed.rollback.sql`：还原为改造前的默认九区块结构（同样条件保护，不覆盖运营编辑）
      * 同一份默认字面量、同一套条件：等价 → `UPDATE ... SET schema_version = 1 WHERE schema_version = 2`；含 `children` → 只提示（并要求先回滚前端递归渲染），不改内容；已被运营编辑且无嵌套 → 保持原样且版本标记也不回落（该页内容已不属于默认划分）
      * 头注写明执行顺序：先回滚前端与后端（`blocksSchema` 递归校验），再跑本脚本
- [x] 6.3 同步 `backend/sql/schema.sql`（本 change 无表结构变更，只核对种子注释与 `schema_version` 默认值口径）
      * 核对结果：**本机库里根本没有 `schema_version` 列**——`005_pages_schema_version.sql` 从未执行（`information_schema` 里 `public.pages` 共 13 列，无该列），而 `schema.sql` 建库基线也缺它；`src/` 全仓 grep 无任何 `schema_version` 读写点（005 注释里的「建议在 POST /pages 与 PUT draft 写入」从未落地）
      * 已在 `schema.sql` 的 `pages` 表补 `schema_version INTEGER NOT NULL DEFAULT 1` + 列注释，并把 `content_json` 注释改成 `{ blocks:[{id,type,visible,props,children?}] }`；013 靠存在性判定自适应，未跑 005 的老库也不会报错
      * 登记缺口：本机要么补跑 005，要么接受标记缺失（渲染不受影响，只影响「哪些页仍是默认结构」可查询性）；后端不写该列，未来若有批量重种需求需先在 `PUT /pages/:id/draft` 落 `schema_version`
- [x] 6.4 本机连库正反两向各跑一次，记录：已编辑页在正向下内容未被改动、回滚后与初始一致
      * 2026-11-06 经授权执行（本机 `psql` 不在 PATH 且需口令，改用 backend 的 `pg` 连接跑脚本正文，全程不回显连接串）。前置先补跑 `005_pages_schema_version.sql` 建列（列原本不存在，`pages` 由 13 列变 14 列）
      * 正向：NOTICE 三连「线上=默认划分无需重写 / 草稿=默认无需重写 / schema_version 置 2」，`content_json` 与 `draft_json` 的 md5 前后一致（`9b28bc65f3e3`），`updated_at` 由 2026-10-19 变为本次执行时间
      * 「已编辑」分支在事务内演练后 `ROLLBACK`：把 `blocks[0].props.title` 改一处再跑正向 → NOTICE 转为「已被运营编辑，一行不改」+「非默认结构，schema_version 保持原值」，内容 md5 全程等于正向值，未提交任何改动
      * 「已含嵌套」分支同样事务内演练反向：给 `blocks[0]` 注入 1 个 `children` 原子后跑 rollback → NOTICE「已带嵌套子内容，一行不改，请确认先回滚前端递归渲染」，回滚事务后指纹复原
      * 反向（提交）：NOTICE「仍是默认划分，schema_version 回落为 1」，最终 `schema_version=1`、内容与初始逐字节一致；断言 6 项全 PASS
      * 本机遗留状态：`pages.schema_version` 列已存在且 5 个导航页全为 1，home 未标 2（后续放开嵌套产出时按 8.5 顺序再跑正向 013）

## 7. 文档回写（逐文件点名）

- [x] 7.1 `docs/service-design/02-官网低代码装修平台设计与实施文档.md`：§1.2「结构固定、内容可编辑」补「模块可装载基础元素」的边界；§3 区块体系加「模块 / 基础元素」两层与九模块色带表
      * §1.2 新增一条边界口径（`accepts` 白名单、不得容器套容器、深度 4/子内容 50/节点 400）；§3 加「两层类型」说明 + 4 个 `ui-*` 原子表（名称与 props 逐条对齐注册表实际值：文字/标题组/图片/按钮）+ 首页九模块 `band` 表（form/color/source 逐段取自 `sectionRegistry.ts`）
      * 表底明确「通栏色带 7 段 + 卡片 2 张、模块数仍是 9」，并写清 `themeable` 与 `fixed` 的差别与「背景未指定」标注
- [x] 7.2 `docs/数据结构文档.md`：区块树定义、`children` 语义、深度与数量上限、结构版本 2
      * §5.1 的 jsonc 示例加 `children` 节点；新增「区块树与 `children` 语义」五条（先模块后子内容、空数组不落库、四项上限前后端同值、容器套容器禁用、读取时 `MIGRATIONS` 迁移与 `schema_version` 只是可查询标记）
      * 类型表补「4 种基础元素」小节；§2.7 迁移表登记 `013_home_module_seed.sql`（无 DDL、依赖 005、成对反向）；`pages` 行补 `schema_version` 列与 `children?` 结构
- [x] 7.3 `docs/接口文档.md`：递归校验规则、错误路径形式、上限值
      * 替换原先「必须为 `{ blocks: [{id,type,visible,props}] }`…后端不校验」的整段口径：递归同构节点、四项上限取值、zod 与遍历复核的两类错误消息各举实例（`blocks.0.children.0.type` / 「嵌套深度超过 4 层」）、`deepSanitize` 覆盖子树、`403 缺少权限：content:write` 不落草稿（该文案与 401 口径按 `middleware/auth.ts:46-53` 实测读码确认）
- [x] 7.4 `docs/前端执行文档.md`：`src/components/ui/` 目录职责与「基础元素单一实现两处用法」的口径（D3）
      * 架构树补「装修区块 / 公共元素 / 后台装修」三行；设计原则加两条：① 基础元素单一实现两处用法（`SectionRenderer` 对 atom 直接 `v-bind="atomBindProps(...)"` 渲染同一组件，**不新建装修专用壳组件**）；② 子内容落位走模块 `<slot />`
      * 同步登记边界：`accepts`/`allowedIn` 只在编辑器侧强制，后端只校验骨架与上限，直接调接口仍可存入未被接受的子内容
- [x] 7.5 `docs/后端执行文档.md`：`blocksSchema` 递归与上限来源、`deepSanitize` 覆盖子树
      * 目录结构补 `src/blocks.ts` 与 `scripts/verify-blocks.ts`；§5.1 加 6 条（z.lazy 递归、`BLOCK_LIMITS` 取值与两侧同值、深度/总数由遍历复核、路径化消息、子树清洗、无测试运行器时 `npx tsx scripts/verify-blocks.ts` 固口径）
      * §6.2 迁移清单补 013 与「005 建列」「按上线顺序排在最后」，并注明 `schema.sql` 基线已含 `pages.schema_version`
- [x] 7.6 `openspec/config.yaml`：内容模型描述补可选子节点序列
      * 内容模型行改为 `{blocks:[{id,type,visible,props,children?}]}` 并带上四项上限值与「两侧同值需同步」；注册表描述补 `layer: module|atom + band + accepts`
- [x] 7.7 `docs/service-design/03-…方案选型与实施设计.md`：把 R2 的 P1 对应到本 change，标注已启动
      * §4 开头加落地状态框（P1 已启动，三处口径差异：容器 → 模块装载 atom、`a-*` → `ui-*`、P2 拖拽未启动）；分期表新增 `P1′` 行列出本期实交付内容与验收出处
      * §4.1 补「首期落地清单」（atom 四件对照表 + 未落地项归 P2/P3/009）与「九模块 × 基础元素调用矩阵」（模块内已改用 / 是否开放子内容位 / 未开放原因；数据驱动两段 feature-products、latest-news 不接受子内容）
      * 修正失同步：§1 现状盘点处（`blocksSchema` 扁平 + 「后端不校验」）加现状说明——递归与上限已在服务端强制，「不校验」仅剩 props 内容层面；§4.5 后端条目逐条标注已落地/未启动
- [x] 7.8 验证：逐份 `grep` 确认上述文件已出现本次口径，无「只改一份」的失同步
      * `grep` 六个关键词（change 名 / `BLOCK_LIMITS` / 嵌套深度 / `013_home_module_seed` / `components/ui` / `ui-heading`）命中 6 份文档 + config.yaml，共 42 处；`01-frontend-buinessweb-design.md` 不含区块模型，无需同步
      * 全仓再 grep「后端不校验」「不新建公共组件」两类旧口径：仅剩的两处（03 §1 现状盘点、接口文档「不校验类型清单」）语义仍准确且已带现状说明，无残留断言
      * 代码侧对齐核对：注册表 9 个模块的 `accepts` 取值（hero/intro-eco/mvv/values/story/pm-entry/cta-banner 开、feature-products/latest-news 关）与文档矩阵一致；`ui-*` 四件的 label 与 props 与文档表格一致

## 8. 端到端验收与上线顺序

- [x] 8.1 全量类型检查与单测：`cd buinessweb && pnpm type-check && pnpm test:unit`；`cd backend && npx tsc --noEmit`
      * 前端 `vue-tsc --noEmit -p tsconfig.vitest.json` 无输出即通过；`pnpm test:unit --run` → Test Files 9 passed / Tests 80 passed（8.2 走查中修掉一处缺陷后复跑为 9 passed / **81 passed**）
      * 后端 `npx tsc --noEmit` 通过；`npx tsx scripts/verify-blocks.ts` → `verify-blocks: 5 组断言全部通过`
- [x] 8.2 浏览器闭环走查（对应 spec 全部 7 项需求）：组件库插入基础元素 → 保存草稿（官网不变）→ 预览 → 发布（官网即时生效）→ 下线 → 回滚历史版本
      * 环境：dev 跑在 **5191**（5190 已被占用），后端 :3000，超管登录；入口 `http://localhost:5191/admin/pages/editor/home`
      * 插入基础元素：选中「首页首屏 Hero」→ 点组件库「文字」→ 节点 9→10，结构树出现 `▾ 首页首屏 Hero / · 文字`，编辑态面包屑自动落到子层并显示「首页首屏 Hero · 第 1 项 / 文字 · 第 1 项」
      * 保存草稿：`PUT /api/pages/1/draft` 成功；线上 `GET /api/public/pages/home` 的 `content_json` 与基线**逐字节一致**（sha256 前 12 位 `be6191e3b903` 未变，整包只有 `updated_at` 变化）；库里 `draft_json` 带 `children:[{id:"ui-text-yexqv3",type:"ui-text",…}]`
      * 预览：`/preview/home` 渲染出「验收用临时文字 R2-8.2」，并带「草稿预览 · Centremix 芯联创」条幅
      * 发布：确认框文案「发布后草稿内容将立即覆盖官网线上版本」；官网 `/` 内该原子以 `.ui-text.ui-text--body.ui-text--md` 出现在 `.hero` 之内、无预览条幅；`content_json` sha→`8ea2ce16e0d7`、含 children 的模块数=1、`published_at` 落下时间
      * 下线：确认框文案「下线后官网将不再展示该页面」；`GET /api/public/pages/home` → `{code:0,data:null}`；前台回落 `pageDefaults` 内置默认渲染（正是 spec「首页内容未发布」写的两条分支中「内置回落仍在」那一条，非本 change 改动）
      * **回滚历史版本：本 change 无法走查**——全仓检索 `page_versions` 只命中设计/提案文档（属 `page-publication-approval`），代码与迁移均无版本表，也没有回滚入口；已从验收清单标注为不适用，不以推测充数
      * 走查中顺带覆盖的 spec 场景：模块插入顶层（选中第 2 项插「CTA 横幅」→ 新模块落在第 3 位、其余后移）、禁用位置（选中数据驱动的「精选产品」→ 4 个基础元素全部 `lib-cell disabled` 并显示 `REASON_DATA_DRIVEN`，点击为 0 变更）、重复插入与重复保存（两次插入得到 `latest-news-bagrps`/`latest-news-k7uasn` 两个不同 id；连点三次保存，`draft_json` 三次完全相同、节点数恒为 12）
      * **发现并修复一处缺陷（属 D3「单一实现两处用法」的落点）**：`SectionRenderer` 的 atom 分支只 `v-bind="atomBindProps(type, props)"`，从不传 `preview`，导致 `UiImage` 的「图片未选择」与 `UiButton` 的「跳转地址不合法」两类编辑态提示在子内容层**从未出现过**（单测直接给组件传 `preview=true` 所以一直是绿的）。修法：`atomBindProps(type, raw, preview?)` 按组件自身是否声明该 prop 追加（不在注册表维护第二份清单），`SectionRenderer.vue:32` 传入 `preview`，并在 `SectionRenderer.spec.ts` 新增「子内容的缺省提示只在编辑态出现，官网态不出现也不留破损元素」一条断言（含未声明 `preview` 的 `UiText` 根节点不得多出 DOM 属性）。修复后浏览器实测：`.ed-canvas` 内同时出现「图片未选择」与 `HREF_RULE_TIP` 全文
      * 两处 spec↔实现不一致已按**实现口径**回写 `spec.md`：① 「跳转地址不合法」——实现是编辑态透出允许形式 + 官网侧 `href="#"` 中和跳转，并不拒绝保存（后端只校验骨架与上限）；② 「内容接口异常」——官网侧按既有「永不白屏」口径保持内置兜底、由刷新重试，不新增错误态组件
- [x] 8.3 三态走查（D7）：未发布 / 模块空内容 / 接口异常三种表现各截图一次；异常态确认禁止保存
      * 未发布/下线：见 8.2（`data:null` + 内置回落）
      * 模块空内容：清空「CTA 横幅」的标题与描述 → `.ed-canvas .cta-banner` 数量 1→0、画布内区块 11→10，上下模块直接相邻、无空白高度
      * 接口异常 + 只读：把 pinia 的 `user.permissions` 置为 `['content:read']` 并拦截 `GET /api/pages/by-slug/home` 的 XHR 后重挂载编辑器 → 「节点 0」+ `Network Error` 提示；组件库 **23/23 项全部 disabled**（可浏览不可插入）；「保存草稿」按钮 `disabled=true` 且拦截计数 PUT=0，即异常态确实禁止保存
      * 可写账号读失败仍回落 `defaultBlocks`（`editor.vue:122-128`），属本 change 之外的既有口径，已在 spec 的异常场景里如实写明
      * **截图未取得**：Qoder 内置浏览器视口处于隐藏态，`take_screenshot` 返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`；三态改以 DOM 计数 + 接口响应为证据
- [x] 8.4 兼容回归：库里现存 5 个导航页逐页比对，确认零视觉变化（原描述里的「首页第 7/8 段新增分隔」已随修订后的 D1 取消，故预期为完全无变化）
      * `/、/about、/products、/news、/contact` 逐页：0 条 console/window error、0 张破图（`naturalWidth===0`）、h1 与区块结构符合预期
      * 首页 9 个顶层节点与 HEAD 同序同色带；`git diff --stat -- "*.css"` 为空 → `website.css` 与全局 tokens 一行未改
      * 类名盘点：12 个 `Sec*.vue` 的 class 集合逐一与 `git show HEAD:` 比对，只有 `.sec-head/.eyebrow/.sec-link`（移入 `UiHeading`，同名类保留）与 `.btn btn-primary/ghost/ghost-light`（移入 `UiButton`，scoped 样式逐属性复刻 `.btn`）两组位移；新增的 `.container.block-children` 包裹层在 CSS 里没有任何规则、空 children 时零高度
      * 顺带核实：每个模块根元素带 `preview="false"` 这个 DOM 属性是 **HEAD 就有的**行为（旧渲染器已 `:preview="preview"` 而多数 `Sec*.vue` 未声明该 prop），非本 change 引入，本次未动，留作独立清理项
      * 逐页截图同样受视口隐藏限制未取，以类名盘点 + 渲染计数替代
- [x] 8.5 上线顺序执行：先发前端（递归渲染 + 护栏）→ 验证官网正常 → 再放开编辑器产出嵌套 → 最后跑迁移 013
      * 前端先行：递归渲染 + `nestedSaveGuardMessage` 护栏（D5，`RENDERER_SUPPORTED_SCHEMA_VERSION=2`）已被 `blocks.spec.ts:196-210` 覆盖——渲染器版本读不懂嵌套时拒绝保存，故老前端不会存入嵌套
      * 官网正常：8.4 的 5 页零报错、首页九段结构与色带未变
      * 再放开编辑器产出嵌套：8.2 的插入→草稿→预览→发布全链实测通过
      * 最后跑 013：依赖 005 建列，正反向各跑一次的实测记录见 6.4；当前首页 `schema_version=1` 且无 children，重复执行只会输出 NOTICE 或打标，不改内容
- [ ] 8.6 提交切分与推送需用户明确指示（本 change 不自行提交）
      * 现状：`z-buiness` 为 git 工作树，43 项改动（含 6 份文档 + 新目录 `buinessweb/src/components/ui/` + `backend/src/blocks.ts` + 迁移 013 正反向 + 4 份新 spec 文件）全部未提交；走查用的临时脚本已删除，本机 `pages.home` 已复位为改动前的 002 默认字面量（md5 `9b28bc65f3e3a303f1b3561f69bffcf9`、`status=1`、`published_at=NULL`、`schema_version=1`、`draft_json==content_json`）
