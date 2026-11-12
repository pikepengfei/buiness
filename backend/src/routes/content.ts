import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryPaginated, transaction } from '../db.js';
import { fail, ok, paginate, sanitize, escapeLike, keywordOf, statusOf, jsonb, stripForeignImages, hasVisibleText } from '../lib.js';
import { authPreHandler, requirePerm, getClientInfo } from '../middleware/auth.js';
import { publicUrl, removeObject } from '../storage.js';
import { ErrCode, isUniqueViolation } from '../errors.js';
import { deepSanitize, duplicateBlockTree, validateBlocks } from '../blocks.js';

const read = [authPreHandler, requirePerm('content:read')];
const write = [authPreHandler, requirePerm('content:write')];

function audit(req: any, action: string, type: string, id: any) {
  const { ip } = getClientInfo(req);
  return query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,ip) VALUES($1,$2,$3,$4,$5)`,
    [req.user?.id ?? null, action, type, String(id), ip]);
}

// 资讯侧留痕（D13）：entity_type 恒为 article、entity_id 写 uid（行 id 会随搬运消失，uid 才是那条内容），
// 并首次启用 audit_logs.diff 记「本次改了哪些字段、改前改后是什么」。其它实体仍走 audit() 的旧形态。
function auditArticle(req: any, action: string, uid: any, diff?: ContentDiff) {
  const { ip } = getClientInfo(req);
  return query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,diff,ip) VALUES($1,$2,'article',$3,$4,$5)`,
    [req.user?.id ?? null, action, String(uid), diff ? jsonb(diff) : null, ip]);
}

// 产品侧留痕同形：entity_type 恒为 product、entity_id 写 uid。
// 两链的审计各按自己的 entity_type 过滤即自洽，不跨链共用文案常量。
function auditProduct(req: any, action: string, uid: any, diff?: ContentDiff) {
  const { ip } = getClientInfo(req);
  return query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,diff,ip) VALUES($1,$2,'product',$3,$4,$5)`,
    [req.user?.id ?? null, action, String(uid), diff ? jsonb(diff) : null, ip]);
}

// 批量排序请求体：[{ id, sort }]
const reorderSchema = z.object({
  items: z.array(z.object({ id: z.coerce.number().int().positive(), sort: z.coerce.number().int().min(0).max(999999) }))
    .min(1).max(500),
});

// 导航位：与 menus.location 的 CHECK 约束保持一致
const MENU_LOCATIONS = ['header', 'footer', 'cta'] as const;

// ---------------- 官网一级页面地址（A 方案 `/:slug` 软通配） ----------------
// 固定一级页：路由由代码注册，页面记录与对应导航行都不可删除。固定身份由 slug 集合派生，
// 不额外加 is_fixed 列——「地址是否固定」的真相在路由表里，数据库标记只会制造第二份真相，
// 还会让代码在迁移未执行的库上直接报错。
const FIXED_PAGE_SLUGS = ['home', 'about', 'products', 'news', 'contact'] as const;
// 保留字：固定页 + 二级详情前缀 + 辅助/门控/管理段 + 历史死链（option 必须入表，否则死链复活）。
// 与 buinessweb/src/website/pageRoutes.ts 的同名常量保持同步。
const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  ...FIXED_PAGE_SLUGS,
  'product', 'article', 'search', 'login', 'preview', 'admin', 'option', 'p', '404',
]);
const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pageUrlOf = (slug: string) => `/${slug}`;
/**
 * 页面标识录入规范化：与 buinessweb/src/website/pageRoutes.ts 的 normalizePageSlug 同口径，
 * 改动须两端同步。运营常把地址连同 `/` 一起粘贴，或从网页复制带进零宽字符/空格，
 * 这里统一整理后再校验与落库，避免「看着没问题却报格式错」。
 */
const normalizePageSlug = (raw: string) => String(raw ?? '')
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00A0]/g, '')
  .trim()
  .replace(/^\/+/, '')
  .toLowerCase()
  .replace(/[\s_./\\]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '');

// 资讯状态文案单一来源（3.7）：判据是「条目在哪张表 + 草稿表的 state」，
// 已上线 = articles 有行（status 恒 1）、草稿 = article_drafts 的 state=0、已下线 = state=2。
// 接口错误提示与列表派生字段都引用本表，避免同一状态在前后端各写一份称谓。
export const ARTICLE_STATE_TEXT = { draft: '草稿', published: '已上线', offline: '已下线' } as const;
export type ArticleState = keyof typeof ARTICLE_STATE_TEXT;

// 正文只记长度与摘要：一篇正文可达 256KB，整份进 audit_logs 会把运维记录变成第二份内容存储
function bodyDigest(html: unknown) {
  const text = String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { length: text.length, summary: text.slice(0, 60) };
}

// 短列直接存值、正文按摘要存，供 diff 的 from/to 复用同一口径
const ARTICLE_DIFF_DIGESTERS: Partial<Record<string, (v: any) => any>> = {
  body: bodyDigest,
  tags: (v) => v ?? [],
};
function digestFor(col: string, value: any): any {
  const digester = ARTICLE_DIFF_DIGESTERS[col];
  return digester ? digester(value) : (value ?? null);
}

// 产品状态文案单一来源：判据同样是「条目在哪张表 + 未上线表的 state」，
// 但称谓用产品域术语（上架/下架），与资讯链的「已上线/已下线」各自一份、不跨链共用常量。
export const PRODUCT_STATE_TEXT = { draft: '草稿', published: '已上架', offline: '已下架' } as const;
export type ProductState = keyof typeof PRODUCT_STATE_TEXT;

// 三态判据单点：在哪张表 + 未上线表 state（已上架不看 products.status，它恒为 1）。
// 线索列表按 uid 回查产品时也要走本函数，避免「下架期间的线索」在另一处再写一份判据。
export function productState(origin: 'online' | 'draft', state: number | string): ProductState {
  return origin === 'online' ? 'published' : (Number(state) === 2 ? 'offline' : 'draft');
}

// 审计 diff 的形态（D13）：只记被改的列与改前改后值；正文这类可能很大的列不整份入审计
type ContentDiff = { fields: string[]; from: Record<string, any>; to: Record<string, any> };

// 产品侧 diff 口径：详细描述与资讯正文同理只记长度与摘要；三类形态列给出数组本身
const PRODUCT_DIFF_DIGESTERS: Partial<Record<string, (v: any) => any>> = {
  description: bodyDigest,
  specs: (v) => v ?? [],
  gallery: (v) => v ?? [],
  highlights: (v) => v ?? [],
};
function productDigestFor(col: string, value: any): any {
  const digester = PRODUCT_DIFF_DIGESTERS[col];
  return digester ? digester(value) : (value ?? null);
}

// diff 只收「值真的变了」的列：整份表单回写时未动的列不进审计，否则每次保存都像改了 13 个字段。
// 归一化而非直接比类型——BIGINT 列驱动回字符串（'12'），客户端提交数字（12），那是同一件事；
// jsonb 会重排对象键序，比字面量会把没动的规格表判成改动
function diffKey(v: any): string {
  if (v === null || v === undefined || v === '') return '\u2205';
  if (Array.isArray(v)) return `[${v.map(diffKey).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${k}:${diffKey(v[k])}`).join(',')}}`;
  }
  return String(v);
}

// ---------------- 标识（slug）生成 ----------------
// 标识不再由运营手填：由服务端在创建落库那一刻生成并写入 slug 列，此后冻结（详见 docs/标识自动生成方案.md）。
// 形态取不透明短码 `{前缀}-{6位}`，字符集 [a-z0-9]。否决拼音转写：多音字与生僻字不可靠，
// 中文名转出来是一长串，既不可读也更容易撞车，而项目约定不为此新增 npm 依赖。
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_TAIL_LEN = 6;
// 36^6 ≈ 20 亿组合，撞车概率极低；重试上限内仍冲突就放手让 INSERT 去撞 UNIQUE（全局 23505 → 409），
// 不静默改名——一次创建请求给出两个不同标识比创建失败更难解释
const SLUG_GEN_ATTEMPTS = 5;

function randomSlug(prefix: string): string {
  let tail = '';
  for (let i = 0; i < SLUG_TAIL_LEN; i += 1) tail += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return `${prefix}-${tail}`;
}

// 单表占用判定（分类只有一张表）。表名来自代码里的字面量，不含外部输入
async function isSlugTaken(table: string, slug: string): Promise<boolean> {
  const { rows } = await query(`SELECT 1 FROM ${table} WHERE slug=$1 LIMIT 1`, [slug]);
  return !!rows[0];
}

// 内容标识的占用判定跨两张表：未上线行与线上行共同判唯一，
// 否则要等发布事务里才炸成一次搬运失败——那是运营最不预期的时刻
async function isContentSlugTaken(onlineTable: string, draftTable: string, slug: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM ${onlineTable} WHERE slug=$1
     UNION ALL
     SELECT 1 FROM ${draftTable} WHERE slug=$1
     LIMIT 1`, [slug]);
  return !!rows[0];
}

async function genSlug(prefix: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < SLUG_GEN_ATTEMPTS; i += 1) {
    const candidate = randomSlug(prefix);
    if (!(await taken(candidate))) return candidate;
  }
  return randomSlug(prefix);
}

// 素材引用扫描：objectKey 是访问 URL 的子串，整行转文本匹配即可同时覆盖两种存法。
// 表名为字面量白名单，不含外部输入。资讯草稿表也在清单内——草稿正文同样引用站内图，
// 漏掉它会让「只被草稿引用的素材」被删成死链。
const MEDIA_REF_TARGETS: [table: string, labelCol: string, label: string][] = [
  ['pages', 'slug', '页面'], ['products', 'slug', '产品'], ['articles', 'slug', '资讯'],
  ['article_drafts', 'slug', '资讯草稿'], ['product_drafts', 'slug', '产品草稿'], ['banners', 'position', 'Banner'],
];
async function findMediaRefs(objectKey: string): Promise<string[]> {
  const like = `%${escapeLike(objectKey)}%`;
  const refs: string[] = [];
  for (const [table, labelCol, label] of MEDIA_REF_TARGETS) {
    const { rows } = await query(
      `SELECT ${labelCol} AS ref FROM ${table} WHERE ${table}::text LIKE $1 LIMIT 5`, [like]);
    if (rows.length) refs.push(`${label}(${rows.map((r: any) => r.ref).join(',')})`);
  }
  return refs;
}

export async function contentRoutes(app: FastifyInstance) {

  // 集中校验所有 :id / :draftId 路由参数为正向整数，避免 NaN 进入 SQL
  app.addHook('preHandler', async (req, reply) => {
    for (const key of ['id', 'draftId'] as const) {
      const raw = (req.params as any)[key];
      if (raw === undefined) continue;
      if (!/^\d+$/.test(String(raw)) || Number(raw) <= 0) {
        return fail(reply, 400, `路径参数 ${key} 非法`, ErrCode.BAD_REQUEST);
      }
    }
  });

  // slug 唯一性预检（创建前友好提示，同时作为全局 23505 捕获的双保险）
  async function assertSlugFree(table: string, slug: string, reply: any): Promise<boolean> {
    const { rows } = await query(`SELECT 1 FROM ${table} WHERE slug=$1`, [slug]);
    if (rows[0]) { fail(reply, 409, `slug 已存在：${slug}`, ErrCode.SLUG_EXISTS); return false; }
    return true;
  }

  // ---------------- 单页 pages（区块化装修 + 草稿/发布双版本） ----------------
  app.get('/pages', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(
      `SELECT id, slug, title, status, published_at,
              (draft_json <> '{}'::jsonb AND draft_json IS DISTINCT FROM content_json) AS has_unpublished_draft,
              updated_at FROM pages ORDER BY updated_at DESC`);
    return ok(reply, rows);
  });
  // 管理端按 slug 取整页（含草稿），编辑器使用
  app.get('/pages/by-slug/:slug', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(`SELECT * FROM pages WHERE slug=$1`, [(req.params as any).slug]);
    if (!rows[0]) return fail(reply, 404, '页面不存在');
    return ok(reply, rows[0]);
  });
  // 新增一级页：这里是「新建顶部 tab 栏目」的唯一入口。
  // 页面记录与顶栏行必须同生共死——只建页面不建 tab 是「发布了没入口」，
  // 只建 tab 不建页面（旧导航菜单页的做法）就是 /option 死链的成因。
  app.post('/pages', { preHandler: write }, async (req, reply) => {
    const s = z.object({
      slug: z.string().min(1).max(80), title: z.string().min(1).max(120),
      metaTitle: z.string().max(160).optional(), metaDescription: z.string().max(300).optional(),
      heroImage: z.string().optional(), status: z.coerce.number().min(0).max(1).default(0),
      contentJson: z.any().default({}),
    }).safeParse(req.body);
    if (!s.success) return fail(reply, 400, '参数错误');
    const b = s.data;
    const slug = normalizePageSlug(b.slug);
    const title = b.title.trim();
    if (!title) return fail(reply, 400, '页面标题不能为空', ErrCode.BAD_REQUEST);
    if (!PAGE_SLUG_RE.test(slug)) {
      return fail(reply, 400, '页面标识只能含小写字母、数字与中划线，且不能以中划线开头或结尾；请去掉中文、标点或粘贴带入的不可见字符', ErrCode.BAD_REQUEST);
    }
    if (RESERVED_PAGE_SLUGS.has(slug)) {
      return fail(reply, 400, `「${slug}」是系统保留地址，请换一个页面标识`, ErrCode.BAD_REQUEST);
    }
    if (!(await assertSlugFree('pages', slug, reply))) return;
    const v = validateBlocks(b.contentJson);
    if (!v.ok) return fail(reply, 400, v.msg, ErrCode.BAD_REQUEST);
    const cleaned = deepSanitize(v.data);
    const tabUrl = pageUrlOf(slug);
    // menus 在 header 上有 partial UNIQUE(url)，先给可读文案，别把 23505 直接抛给运营
    const { rows: dup } = await query(`SELECT 1 FROM menus WHERE location='header' AND url=$1`, [tabUrl]);
    if (dup[0]) return fail(reply, 400, `顶部导航已存在「${tabUrl}」，请换一个页面标识`, ErrCode.BAD_REQUEST);

    let pageId = 0;
    try {
      await transaction(async (client) => {
        const ins = await client.query(
          `INSERT INTO pages(slug,title,meta_title,meta_description,hero_image,status,published_at,content_json,draft_json,created_by)
           VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $9 THEN NOW() ELSE NULL END,$7,$7,$8) RETURNING id`,
          [slug, title, b.metaTitle || null, b.metaDescription || null, b.heroImage || null, b.status,
           jsonb(cleaned), req.user!.id, b.status === 1]);
        pageId = Number(ins.rows[0].id);
        // menus.title 只有 VARCHAR(50)，页面标题可达 120，截断以免插入失败；
        // sort 追加到现有顶栏之后，固定六行顺序不受影响。
        // 用 CTE 传参并显式 ::varchar：若把 $2 同时写在 SELECT 列表与 WHERE url=$2，
        // PG 会分别推断成 text 与 varchar，报 "inconsistent types deduced for parameter $2"。
        // 参数只出现一次且类型固定，同时保留 NOT EXISTS 的并发防重语义。
        await client.query(
          `WITH p AS (SELECT $1::varchar AS title, $2::varchar AS url)
           INSERT INTO menus(location,parent_id,title,url,target,sort,status)
           SELECT 'header', NULL, p.title, p.url, '_self',
                  COALESCE((SELECT MAX(sort) FROM menus WHERE location='header' AND parent_id IS NULL), 0) + 1, 1
           FROM p
           WHERE NOT EXISTS (SELECT 1 FROM menus WHERE location='header' AND url=p.url)`,
          [title.slice(0, 50), tabUrl]);
      });
    } catch (e) {
      if (isUniqueViolation(e)) return fail(reply, 409, '页面标识或顶部导航链接已被占用', ErrCode.SLUG_EXISTS);
      throw e;
    }
    await audit(req, 'create', 'page', pageId);
    return ok(reply, { id: pageId, slug, tabUrl });
  });
  app.get('/pages/:id', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(`SELECT * FROM pages WHERE id=$1`, [(req.params as any).id]);
    if (!rows[0]) return fail(reply, 404, '页面不存在');
    return ok(reply, rows[0]);
  });
  // 仅页面 meta 信息（标题/SEO/头图）；区块内容走 PUT /pages/:id/draft
  app.patch('/pages/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const sets: string[] = []; const p: any[] = []; let i = 1;
    if (b.title !== undefined) { sets.push(`title=$${i++}`); p.push(b.title); }
    if (b.metaTitle !== undefined) { sets.push(`meta_title=$${i++}`); p.push(b.metaTitle); }
    if (b.metaDescription !== undefined) { sets.push(`meta_description=$${i++}`); p.push(b.metaDescription); }
    if (b.heroImage !== undefined) { sets.push(`hero_image=$${i++}`); p.push(b.heroImage); }
    if (!sets.length) return fail(reply, 400, '无更新字段');
    p.push(id);
    await query(`UPDATE pages SET ${sets.join(',')} WHERE id=$${i}`, p);
    await audit(req, 'update', 'page', id);
    return ok(reply);
  });
  // 保存草稿（不影响线上正式内容）
  app.put('/pages/:id/draft', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = z.object({ contentJson: z.any() }).safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    const v = validateBlocks(parsed.data.contentJson);
    if (!v.ok) return fail(reply, 400, v.msg, ErrCode.BAD_REQUEST);
    const { rows } = await query(`SELECT id FROM pages WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '页面不存在');
    await query(`UPDATE pages SET draft_json=$1 WHERE id=$2`, [jsonb(deepSanitize(v.data)), id]);
    await audit(req, 'update', 'page', id);
    return ok(reply);
  });
  // 放弃草稿：draft_json 复位为 {}，编辑器回落线上版本
  app.delete('/pages/:id/draft', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rowCount } = await query(`UPDATE pages SET draft_json='{}'::jsonb WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '页面不存在');
    await audit(req, 'discard_draft', 'page', id);
    return ok(reply);
  });
  // 发布：草稿覆盖正式内容并上线
  app.post('/pages/:id/publish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query(`SELECT draft_json FROM pages WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '页面不存在');
    // 从未保存过草稿（draft_json 仍为 {}）时发布会把线上内容清空，必须拒绝
    if (!Array.isArray(rows[0].draft_json?.blocks)) {
      return fail(reply, 400, '草稿为空，请先在编辑器保存草稿后再发布', ErrCode.BAD_REQUEST);
    }
    await query(
      `UPDATE pages SET content_json=draft_json, status=1,
        published_at=COALESCE(published_at,NOW()) WHERE id=$1`, [id]);
    await audit(req, 'publish', 'page', id);
    return ok(reply);
  });
  // 下线：官网不再展示该页（公开接口按 status=1 过滤）
  app.post('/pages/:id/unpublish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query(`SELECT id FROM pages WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '页面不存在');
    await query(`UPDATE pages SET status=0 WHERE id=$1`, [id]);
    await audit(req, 'unpublish', 'page', id);
    return ok(reply);
  });
  // 固定一级页不可删除；新增一级页删除时，同事务清掉它自动生成的顶栏行，
  // 否则官网会留下一个点了就 404 的空 tab。固定导航行与 CTA / 页脚行一律不动。
  app.delete('/pages/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ slug: string }>(`SELECT slug FROM pages WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '页面不存在', ErrCode.NOT_FOUND);
    const slug = rows[0].slug;
    if ((FIXED_PAGE_SLUGS as readonly string[]).includes(slug)) {
      return fail(reply, 400, `「${slug}」是官网固定页面，由代码维护，不可删除；需要暂时隐藏请使用「下线」`, ErrCode.BAD_REQUEST);
    }
    await transaction(async (client) => {
      await client.query(`DELETE FROM pages WHERE id=$1`, [id]);
      await client.query(
        `DELETE FROM menus WHERE location='header' AND parent_id IS NULL AND url=$1`, [pageUrlOf(slug)]);
    });
    await audit(req, 'delete', 'page', id);
    return ok(reply);
  });

  // ---------------- 跨页复制区块（decoration-editor-toolkit D3 / A1 / C1 / C3） ----------------
  // 服务端单事务行锁追加副本：两人同时编辑目标页时后到者在当前草稿上追加，不覆盖他人改动。
  // A1：目标页 draft_json 为 {} 表示「未保存过草稿，回落线上版本」，必须先物化 content_json
  // 再追加——直接写会让 draft 只含复制块，随后发布会把整页替换成该块。
  app.post('/pages/:slug/blocks/copy', { preHandler: write }, async (req, reply) => {
    const targetSlug = String((req.params as any).slug);
    const parsed = z.object({
      sourcePageId: z.coerce.number().int().positive(),
      blockIndex: z.coerce.number().int().min(0),
      targetIndex: z.coerce.number().int().min(0).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '参数错误：sourcePageId / blockIndex 必填且为非负整数', ErrCode.BAD_REQUEST);
    }
    const { sourcePageId, blockIndex, targetIndex } = parsed.data;

    type CopyResult = { notFound: string } | { bad: string } | { targetId: number; blockCount: number };
    const result = await transaction<CopyResult>(async (client): Promise<CopyResult> => {
      const target = await client.query(`SELECT id, draft_json, content_json FROM pages WHERE slug=$1 FOR UPDATE`, [targetSlug]);
      if (!target.rows[0]) return { notFound: `目标页面（${targetSlug}）不存在` };
      const targetRow = target.rows[0];
      const targetId = Number(targetRow.id);
      // 目标草稿基底：draft 为 {} 时物化线上版本（A1），两者皆空才从零开始
      const draftBlocks = Array.isArray(targetRow.draft_json?.blocks) ? targetRow.draft_json.blocks : null;
      const baseBlocks: any[] = draftBlocks
        ?? (Array.isArray(targetRow.content_json?.blocks) ? targetRow.content_json.blocks : []);

      // 源区块：源页草稿优先，否则线上版本（与编辑器读取回落链同口径）
      let sourceBlocks: any[] | null = null;
      if (targetId === sourcePageId) {
        sourceBlocks = baseBlocks.length ? baseBlocks : null; // 复制到自身页面：直接用锁定行内容
      } else {
        const src = await client.query(`SELECT draft_json, content_json FROM pages WHERE id=$1`, [sourcePageId]);
        if (!src.rows[0]) return { notFound: '来源页面不存在' };
        const d = src.rows[0].draft_json;
        const c = src.rows[0].content_json;
        sourceBlocks = Array.isArray(d?.blocks) ? d.blocks : Array.isArray(c?.blocks) ? c.blocks : null;
      }
      if (!sourceBlocks) return { notFound: '来源页面没有可复制的区块内容' };
      const source = sourceBlocks[blockIndex];
      if (!source) return { notFound: `来源页面第 ${blockIndex + 1} 个区块不存在` };

      // 深拷贝整树（含 children）+ 逐节点全新 id（C3：服务端独立 id 生成）
      const taken = new Set<string>();
      const collectIds = (list: any[]) => list.forEach((b) => {
        taken.add(String(b.id));
        if (b.children?.length) collectIds(b.children);
      });
      collectIds(baseBlocks);
      const copy = duplicateBlockTree(source, taken);
      // 副本过 deepSanitize（A2 同口径）：复制内容落库前统一白名单清洗
      const cleaned = deepSanitize(copy);

      const at = targetIndex ?? baseBlocks.length;
      if (at > baseBlocks.length) {
        return { bad: `插入位置超出范围：目标页当前共 ${baseBlocks.length} 个顶层区块` };
      }
      const next = [...baseBlocks];
      next.splice(at, 0, cleaned);
      // G6.2 服务端独立结构校验：上限与前端 BLOCK_LIMITS 一致，前端校验不是唯一防线
      const v = validateBlocks({ blocks: next });
      if (!v.ok) return { bad: `复制会超出页面结构上限：${v.msg}` };
      await client.query(`UPDATE pages SET draft_json=$1 WHERE id=$2`, [jsonb(v.data), targetId]);
      return { targetId, blockCount: next.length };
    });

    if ('notFound' in result) return fail(reply, 404, result.notFound, ErrCode.NOT_FOUND);
    if ('bad' in result) return fail(reply, 400, result.bad, ErrCode.BAD_REQUEST);
    // C1 审计留痕：跨页复制记 page 域动作，可追溯「谁把哪页的区块复制到了哪页」
    await audit(req, 'copy_block', 'page', result.targetId);
    return ok(reply, {
      targetId: result.targetId,
      blockCount: result.blockCount,
      message: `已复制到目标页草稿末尾，当前共 ${result.blockCount} 个顶层区块；复制的是副本，之后与来源页互不影响`,
    });
  });

  // ---------------- 区块模板（decoration-editor-toolkit D4 / D9 / A2 / C1） ----------------
  // 模板 = 单个区块自身 props 的快照，children 不入库（子内容属于页面实例）。
  // 类型语义是否可用由前端注册表判定（isTemplateUsable / 类型已下线标记），后端不重复维护类型清单，
  // 只校验 key 形态与体积/条数上限——与 pages 草稿「后端不维护类型清单」的既有口径一致。
  const TEMPLATE_PROPS_MAX_BYTES = 256 * 1024;
  const TEMPLATE_LIST_MAX_ITEMS = 200;
  const templateSchema = z.object({
    name: z.string().min(1).max(80),
    type: z.string().min(1).max(40).regex(/^[a-z][a-z0-9-]*$/, 'type 必须是注册表键形态（小写字母/数字/中划线）'),
    props: z.record(z.unknown()).default({}),
  });

  /** props 体积与 list 类字段条数上限（D9）：rich-text 的 html 最可能撑大，序列化字节数即体积 */
  function templatePropsIssue(props: unknown): string | null {
    const serialized = JSON.stringify(props ?? {});
    if (serialized.length > TEMPLATE_PROPS_MAX_BYTES) {
      return `序列化后 ${serialized.length} 字节，超出上限 ${TEMPLATE_PROPS_MAX_BYTES} 字节`;
    }
    let listIssue: string | null = null;
    const walk = (v: unknown) => {
      if (listIssue) return;
      if (Array.isArray(v)) {
        if (v.length > TEMPLATE_LIST_MAX_ITEMS) listIssue = `列表字段条目 ${v.length} 超出上限 ${TEMPLATE_LIST_MAX_ITEMS} 项`;
        v.forEach(walk);
      } else if (v && typeof v === 'object') {
        Object.values(v).forEach(walk);
      }
    };
    walk(props);
    return listIssue;
  }

  // 列表全量返回 props（前端缩略要真实渲染模板自身内容，D10）；OCTET_LENGTH 附带字节体积供前端提示
  app.get('/block-templates', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const kw = keywordOf((req.query as any).keyword);
    const type = keywordOf((req.query as any).type, 40);
    const where: string[] = [];
    const params: any[] = [];
    if (kw) { where.push(`t.name ILIKE $${params.length + 1}`); params.push(`%${escapeLike(kw)}%`); }
    if (type) { where.push(`t.type=$${params.length + 1}`); params.push(type); }
    const { rows, total } = await queryPaginated(
      `SELECT t.id, t.name, t.type, t.props, COALESCE(u.display_name, u.username) AS created_by_name,
              t.created_at, t.updated_at, OCTET_LENGTH(t.props::text) AS props_bytes
         FROM block_templates t LEFT JOIN users u ON u.id = t.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });

  app.post('/block-templates', { preHandler: write }, async (req, reply) => {
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '参数错误：name / type 必填且长度受限，props 必须是对象', ErrCode.BAD_REQUEST);
    }
    const b = parsed.data;
    const issue = templatePropsIssue(b.props);
    if (issue) return fail(reply, 400, `模板内容超限：${issue}`, ErrCode.UNPROCESSABLE);
    // A2：模板 props 会经 LibraryCard → SectionRenderer（含 v-html）渲染，入库前统一 deepSanitize，
    // 防止把存储型 XSS 写进模板库（与页面草稿 PUT 同口径）
    const cleaned = deepSanitize(b.props);
    let id = 0;
    try {
      const { rows } = await query(
        `INSERT INTO block_templates(name,type,props,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
        [b.name.trim(), b.type, jsonb(cleaned), req.user!.id]);
      id = Number(rows[0].id);
    } catch (e) {
      if (isUniqueViolation(e)) {
        return fail(reply, 409, `已存在同类型同名的模板「${b.name}」，请改名，或确认后用覆盖更新`, ErrCode.SLUG_EXISTS);
      }
      throw e;
    }
    await audit(req, 'create', 'block_template', id);
    return ok(reply, { id });
  });

  // 改名 / 改类型 / 覆写内容（重名覆盖走本端点：前端二次确认后整份重写 name/type/props）
  app.patch('/block-templates/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = templateSchema.partial().safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误', ErrCode.BAD_REQUEST);
    const b = parsed.data;
    if (b.name === undefined && b.type === undefined && b.props === undefined) {
      return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    }
    if (b.props !== undefined) {
      const issue = templatePropsIssue(b.props);
      if (issue) return fail(reply, 400, `模板内容超限：${issue}`, ErrCode.UNPROCESSABLE);
    }
    const sets: string[] = [];
    const p: any[] = [];
    let i = 1;
    if (b.name !== undefined) { sets.push(`name=$${i++}`); p.push(b.name.trim()); }
    if (b.type !== undefined) { sets.push(`type=$${i++}`); p.push(b.type); }
    if (b.props !== undefined) { sets.push(`props=$${i++}`); p.push(jsonb(deepSanitize(b.props))); }
    p.push(id);
    let rowCount: number | null = 0;
    try {
      const res = await query(`UPDATE block_templates SET ${sets.join(',')} WHERE id=$${i}`, p);
      rowCount = res.rowCount;
    } catch (e) {
      if (isUniqueViolation(e)) {
        return fail(reply, 409, '已存在同类型同名的模板，覆盖前请先调整命名', ErrCode.SLUG_EXISTS);
      }
      throw e;
    }
    if (!rowCount) return fail(reply, 404, '模板不存在', ErrCode.NOT_FOUND);
    await audit(req, 'update', 'block_template', id);
    return ok(reply);
  });

  // 删除任何有写权限者可执行（模板不是线上内容，误删影响面只是下次插入少个选项），前端做二次确认
  app.delete('/block-templates/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rowCount } = await query(`DELETE FROM block_templates WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '模板不存在', ErrCode.NOT_FOUND);
    await audit(req, 'delete', 'block_template', id);
    return ok(reply);
  });

  // ---------------- 资讯分类 ----------------
  // ref_count 跨两张表（已上线 + 草稿与已下线），与删除前置检查同一口径，避免列表显示 0 却删不掉
  app.get('/article-categories', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(
      `SELECT c.*, (
            (SELECT count(*)::int FROM articles a WHERE a.category_id=c.id)
          + (SELECT count(*)::int FROM article_drafts d WHERE d.category_id=c.id)
         ) AS ref_count
         FROM article_categories c ORDER BY c.sort, c.id`);
    return ok(r, rows);
  });
  // 分类标识与产品侧同构改为服务端生成；名称/描述长度上限同样对齐产品分类，
  // 这一段过去只有 `.parse()`（字段缺失直接抛成 500）且完全没有长度校验
  const articleCategorySchema = z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(255).nullish(),
    sort: z.coerce.number().int().min(0).max(999999).default(0),
  });
  app.post('/article-categories', { preHandler: write }, async (req, reply) => {
    const parsed = articleCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '参数错误：名称必填且长度受限', ErrCode.BAD_REQUEST);
    }
    const b = parsed.data;
    const slug = await genSlug('ac', (s) => isSlugTaken('article_categories', s));
    const { rows } = await query(
      `INSERT INTO article_categories(name,slug,description,sort) VALUES($1,$2,$3,$4) RETURNING id`,
      [b.name, slug, b.description || null, b.sort]);
    return ok(reply, { id: rows[0].id, slug });
  });
  app.patch('/article-categories/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    // 标识不在可写列里：创建时生成后即冻结，外部提交的那份被 zod/映射表挡在库外
    for (const k of ['name', 'description', 'sort']) if (b[k] !== undefined) { sets.push(`${k}=$${i++}`); p.push(b[k]); }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    p.push(id);
    await query(`UPDATE article_categories SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  // 删除资讯分类：引用计数跨两张表（已上线行 + 草稿与已下线行），非 0 时拒绝并报出数量（3.6）。
  // 两张表的 category_id 都是 ON DELETE SET NULL，保留它只为「绕过本检查直接改库」的情形兜底。
  app.delete('/article-categories/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ online: number; drafts: number }>(
      `SELECT (SELECT count(*)::int FROM articles WHERE category_id=$1) AS online,
              (SELECT count(*)::int FROM article_drafts WHERE category_id=$1) AS drafts`, [id]);
    const total = rows[0].online + rows[0].drafts;
    if (total > 0) {
      return fail(reply, 409,
        `该分类下还有 ${total} 条资讯（线上 ${rows[0].online} 条、草稿 ${rows[0].drafts} 条），请先移动或删除后再删分类`,
        ErrCode.UNPROCESSABLE);
    }
    const { rowCount } = await query(`DELETE FROM article_categories WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '分类不存在');
    return ok(reply);
  });

  // ---------------- 资讯 articles ----------------
  // 线上只读口径（D10 修订版）：一条资讯同一时刻只存在于一张表。
  // article_drafts 是所有编辑与删除的落点（state 0=草稿 / 2=已下线），
  // articles 只放正在上线的行——没有改写它内容列的路径，界面对它唯一可做的动作是下线。
  // 因此本链不提供 POST /articles 与 PATCH /articles/:id，也没有「创建即上线」的状态旁路。

  // 搬运时逐列写出的内容列（11.15）：只被发布搬运使用，不是「覆盖线上行」的 UPDATE 清单。
  // uid / view_count / published_at / created_* 由搬运语句单独列出，MUST NOT 交给列默认值重新生成
  const PUBLISH_COLUMNS = ['slug', 'title', 'cover_image', 'summary', 'body', 'category_id', 'tags', 'author'] as const;

  // 写请求必带内容身份（11.14）：两表主键各自递增，数字相同不代表同一条内容，
  // 服务端据此校验「路径里的行 id 与提交的 uid 指向同一行」，把「传错 id」从静默改到别处降级为一次报错
  const uidField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'uid 必须是合法的内容身份标识');

  // 草稿可编辑列与 articles 一一对应；刻意不含 status，zod 会丢弃未知键，多传也无效。
  // 标识（slug）同样不在写入体里：由服务端在创建时生成并落库，此后冻结，外部提交的 slug 被 zod 丢弃
  const draftCreateSchema = z.object({
    title: z.string().min(1).max(200),
    // 可空列用 nullish：PATCH 里「传 null = 清空该列」「不传 = 不动该列」必须区分得开
    coverImage: z.string().max(500).nullish(),
    summary: z.string().max(400).nullish(),
    body: z.string().optional(),
    // 分类 id 是 bigint 列，node-pg 按字符串回传，编辑器原样提交："5" 与 5 必须是同一个分类
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    tags: z.array(z.string().max(40)).max(50).default([]),
    author: z.string().max(50).nullish(),
  });
  // 必填 uid：不给 .nullish() 兜旧调用，签名不留兼容
  const draftPatchSchema = draftCreateSchema.partial().extend({ uid: uidField });
  const publishBodySchema = z.object({ uid: uidField });
  // zod 字段名 → 表列名（PATCH 的可写列清单；标识不在其中，创建后即冻结）
  const DRAFT_FIELDS: [key: string, col: string][] = [
    ['title', 'title'], ['coverImage', 'cover_image'], ['summary', 'summary'],
    ['body', 'body'], ['categoryId', 'category_id'], ['tags', 'tags'], ['author', 'author'],
  ];

  // 正文入库统一口径：白名单清洗在前、站外图片剥除在后，两张表共用同一实现
  function cleanArticleBody(raw: unknown): { html: string; stripped: number } {
    const { html, removed } = stripForeignImages(sanitize(String(raw ?? '')));
    return { html, stripped: removed };
  }

  // 三态判据单点：在哪张表 + 草稿表 state（已上线不再看 articles.status，它恒为 1）
  function articleState(origin: 'online' | 'draft', state: number | string): ArticleState {
    return origin === 'online' ? 'published' : (Number(state) === 2 ? 'offline' : 'draft');
  }

  // 行 id 与 uid 是否指向同一条内容：不符一律拒绝，MUST NOT 按 id 猜测（spec「不猜测」场景）
  async function assertDraftIdentity(draftId: number, uid: string, reply: any): Promise<boolean> {
    const { rows } = await query<{ uid: string }>(
      `SELECT uid FROM article_drafts WHERE id=$1`, [draftId]);
    if (!rows[0]) { fail(reply, 404, '草稿不存在', ErrCode.NOT_FOUND); return false; }
    if (String(rows[0].uid).toLowerCase() !== uid.toLowerCase()) {
      fail(reply, 409, `行 id 与内容身份不符：草稿 ${draftId} 不是你提交的那条资讯，请求已拒绝`, ErrCode.NOT_FOUND);
      return false;
    }
    return true;
  }

  // 新建草稿：只落草稿表 state=0、没有发布时间可言。标识在这一刻生成并与行同笔写入。
  // 界面「保存并发布」= 本接口 + 发布接口两次调用，「新建时直接发布」的正文下限由发布侧统一校验。
  app.post('/articles/drafts', { preHandler: write }, async (req, reply) => {
    const parsed = draftCreateSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误：标题必填，且各字段长度受限', ErrCode.BAD_REQUEST);
    const b = parsed.data;
    const slug = await genSlug('a', (s) => isContentSlugTaken('articles', 'article_drafts', s));
    const cleaned = cleanArticleBody(b.body ?? '');
    const { rows } = await query<{ id: number; uid: string }>(
      `INSERT INTO article_drafts(slug,title,cover_image,summary,body,category_id,tags,author,state,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$9) RETURNING id, uid`,
      [slug, b.title, b.coverImage || null, b.summary || null, cleaned.html,
       b.categoryId ?? null, jsonb(b.tags), b.author || null, req.user!.id]);
    const uid = String(rows[0].uid);
    await auditArticle(req, 'create', uid, {
      fields: ['slug', 'title', 'cover_image', 'summary', 'body', 'category_id', 'tags', 'author'],
      from: {},
      to: {
        slug, title: b.title, cover_image: b.coverImage || null, summary: b.summary || null,
        body: bodyDigest(cleaned.html), category_id: b.categoryId ?? null, tags: b.tags, author: b.author || null,
      },
    });
    return ok(reply, { id: rows[0].id, uid, slug, stripped_images: cleaned.stripped });
  });

  // 保存草稿改动：只写草稿行（草稿与已下线同表同规则），线上内容根本不在本表的可达范围内
  app.patch('/articles/drafts/:draftId', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = draftPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path?.[0];
      return fail(reply, 400, field === 'uid'
        ? '缺少或非法的 uid：写请求必须带上这条资讯的内容身份标识'
        : field ? `参数错误：${String(field)} 不符合要求（${first.message}）` : '参数错误', ErrCode.BAD_REQUEST);
    }
    if (!(await assertDraftIdentity(draftId, parsed.data.uid, reply))) return;
    const b = parsed.data as Record<string, any>;

    const { rows: before } = await query<Record<string, any>>(
      `SELECT slug,title,cover_image,summary,body,category_id,tags,author FROM article_drafts WHERE id=$1`, [draftId]);
    const sets: string[] = [];
    const p: any[] = [];
    let i = 1;
    let stripped = 0;
    const fields: string[] = [];
    const from: Record<string, any> = {};
    const to: Record<string, any> = {};
    for (const [key, col] of DRAFT_FIELDS) {
      if (b[key] === undefined) continue;
      let value: any = b[key];
      if (col === 'body') {
        const c = cleanArticleBody(value);
        value = c.html;
        stripped = c.stripped;
      } else if (col === 'tags') {
        value = jsonb(value); // 数组必须序列化，否则 PG 按数组字面量写入报 22P02
      }
      sets.push(`${col}=$${i++}`);
      p.push(value);
      fields.push(col);
      from[col] = digestFor(col, before[0]?.[col]);
      to[col] = digestFor(col, col === 'tags' ? b[key] : value);
    }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    sets.push(`updated_by=$${i++}`); p.push(req.user!.id);
    p.push(draftId);
    await query(`UPDATE article_drafts SET ${sets.join(',')} WHERE id=$${i}`, p);
    await auditArticle(req, 'update', parsed.data.uid, { fields, from, to });
    return ok(reply, { stripped_images: stripped });
  });

  // 删除未发布内容（草稿与已下线都走这里）：uid 走查询参数做身份校验。
  // 本表内容与线上行毫无关联，删除 MUST NOT 触及任何线上内容。
  app.delete('/articles/drafts/:draftId', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = z.object({ uid: uidField }).safeParse(req.query);
    if (!parsed.success) {
      return fail(reply, 400, '缺少或非法的 uid 查询参数：删除请求必须带上这条资讯的内容身份标识', ErrCode.BAD_REQUEST);
    }
    if (!(await assertDraftIdentity(draftId, parsed.data.uid, reply))) return;
    const { rows } = await query<{ state: number; slug: string; title: string }>(
      `SELECT state, slug, title FROM article_drafts WHERE id=$1`, [draftId]);
    const { rowCount } = await query(`DELETE FROM article_drafts WHERE id=$1`, [draftId]);
    if (!rowCount) return fail(reply, 404, '草稿不存在');
    await auditArticle(req, 'delete', parsed.data.uid, {
      fields: [], from: { slug: rows[0].slug, title: rows[0].title, state: articleState('draft', rows[0].state) }, to: {},
    });
    return ok(reply);
  });

  // 发布 = 整行搬运进发布表（11.11）：同一事务内把未发布行的内容列 + uid + view_count +
  // published_at + created_* 插成线上行，再删除该未发布行。首次发布写发布时间，之后不覆盖；
  // uid MUST NOT 走列默认值重新生成，否则审计历史与已累计的浏览都接不上。
  app.post('/articles/drafts/:draftId/publish', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = publishBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '缺少或非法的 uid：发布请求必须带上这条资讯的内容身份标识', ErrCode.BAD_REQUEST);
    }
    const uid = parsed.data.uid;
    const result = await transaction(async (client) => {
      const d = await client.query(
        'SELECT id,uid,slug,title,state,view_count,published_at,body FROM article_drafts WHERE id=$1 FOR UPDATE', [draftId]);
      const draft = d.rows[0];
      if (!draft) return { kind: 'not_found' as const };
      if (String(draft.uid).toLowerCase() !== uid.toLowerCase()) return { kind: 'identity' as const };
      // 正文下限在写任何一侧之前判定，拒绝时线上与草稿都不变
      const cleaned = cleanArticleBody(draft.body);
      if (!hasVisibleText(cleaned.html)) return { kind: 'empty_body' as const };
      const clash = await client.query('SELECT 1 FROM articles WHERE slug=$1 LIMIT 1', [draft.slug]);
      if (clash.rows[0]) return { kind: 'slug_online' as const, slug: draft.slug };
      // 同一内容身份已有线上行 = 一条内容两处存在，本模型里不可能发生；两表 UNIQUE(uid) 也会挡下
      const dup = await client.query('SELECT 1 FROM articles WHERE uid=$1 LIMIT 1', [uid]);
      if (dup.rows[0]) return { kind: 'already_online' as const };

      const ins = await client.query(
        `INSERT INTO articles(${PUBLISH_COLUMNS.join(',')},uid,status,published_at,view_count,created_by,updated_by,created_at,updated_at)
         SELECT ${PUBLISH_COLUMNS.map((c) => (c === 'body' ? '$3::text' : `d.${c}`)).join(',')},
                d.uid,1,COALESCE(d.published_at,NOW()),d.view_count,d.created_by,$4,d.created_at,NOW()
           FROM article_drafts d WHERE d.id=$1 AND d.uid=$2::uuid
           RETURNING id, uid, view_count, published_at`,
        [draftId, uid, cleaned.html, req.user!.id]);
      if (!ins.rows[0]) return { kind: 'not_found' as const };
      await client.query('DELETE FROM article_drafts WHERE id=$1', [draftId]);
      return {
        kind: 'moved' as const,
        row: ins.rows[0],
        fromState: articleState('draft', draft.state),
        first_published: draft.published_at === null,
        stripped: cleaned.stripped,
      };
    });

    if (result.kind === 'not_found') return fail(reply, 404, '没有可搬运的未发布内容（草稿不存在或已被搬运）');
    if (result.kind === 'identity') {
      return fail(reply, 409, `行 id 与内容身份不符：草稿 ${draftId} 不是你提交的那条资讯，请求已拒绝`, ErrCode.NOT_FOUND);
    }
    if (result.kind === 'empty_body') {
      return fail(reply, 400, '正文没有实际文字，不能发布（空串、纯空白、只有空标签都不算）', ErrCode.BAD_REQUEST);
    }
    if (result.kind === 'slug_online') {
      return fail(reply, 409, `标识「${result.slug}」与线上资讯冲突，请先修改未发布内容的标识`, ErrCode.SLUG_EXISTS);
    }
    if (result.kind === 'already_online') {
      return fail(reply, 409, '该内容身份已有线上行，重复搬运会被拒绝', ErrCode.UNPROCESSABLE);
    }
    await auditArticle(req, 'publish', result.row.uid, {
      fields: ['state'], from: { state: result.fromState }, to: { state: 'published' },
    });
    return ok(reply, {
      id: result.row.id,
      uid: result.row.uid,
      published_at: result.row.published_at,
      view_count: result.row.view_count,
      first_published: result.first_published,
      stripped_images: result.stripped,
    });
  });

  // 管理列表 = 两张表的并集（11.12）：一条条目恰好一行，一行只有一个 id 加来源标记 origin。
  // 不再有 published_id / draft_id 两个 id，也没有「是否存在未发布改动」这一列——副本机制已撤除。
  // 排序取 (updated_at, origin, id) 全序：两表主键各自递增，只按 id 排会在翻页时重行或漏行。
  app.get('/articles', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    const kw = keywordOf(q.keyword);
    if (kw) {
      where.push(`(s.title ILIKE $${params.length + 1} OR s.summary ILIKE $${params.length + 1})`);
      params.push(`%${escapeLike(kw)}%`);
    }
    if (q.categoryId && Number(q.categoryId) > 0) {
      where.push(`s.category_id=$${params.length + 1}`); params.push(Number(q.categoryId));
    }
    // 状态筛选按「在哪张表 + state」：0=草稿、1=已上线（只可能是发布表）、2=已下线
    const st = statusOf(q.status);
    if (st === 0) where.push(`s.origin='draft' AND s.state=0`);
    else if (st === 1) where.push(`s.origin='online'`);
    else if (st === 2) where.push(`s.origin='draft' AND s.state=2`);
    const { rows, total } = await queryPaginated(
      `SELECT s.id, s.origin, s.uid, s.slug, s.title, s.cover_image, s.category_id,
              s.state, s.view_count, s.published_at, s.updated_by, u.username AS updated_by_name, s.updated_at,
              (SELECT c.name FROM article_categories c WHERE c.id = s.category_id) AS category
         FROM (
             SELECT a.id, 'online'::text AS origin, a.uid, a.slug, a.title, a.cover_image, a.category_id, a.summary,
                    1::smallint AS state, a.view_count, a.published_at, a.updated_by, a.updated_at
               FROM articles a
             UNION ALL
             SELECT d.id, 'draft'::text, d.uid, d.slug, d.title, d.cover_image, d.category_id, d.summary,
                    d.state, d.view_count, d.published_at, d.updated_by, d.updated_at
               FROM article_drafts d
         ) s
         LEFT JOIN users u ON u.id = s.updated_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY s.updated_at DESC NULLS LAST, s.origin, s.id DESC`,
      params, pageSize, offset);
    return ok(reply, rows.map((r: any) => {
      const state = articleState(r.origin, r.state);
      return { ...r, state, state_text: ARTICLE_STATE_TEXT[state] };
    }), { page, pageSize, total });
  });

  // 单条取数收口（11.13）：两个端点各读自己那张表的行，不再有「读哪一份」的分支。
  // 线上侧只读，响应明确标注需先下线才能修改；界面据此不渲染编辑与删除入口。
  // 两表列名一致，只按别名生成一次 SELECT：不再有「按字符串替换别名」的脆弱写法
  const articleDetailSql = (t: string, table: string, origin: string, state: string) =>
    `SELECT ${t}.id, '${origin}'::text AS origin, ${t}.uid, ${t}.slug, ${t}.title, ${t}.cover_image, ${t}.summary, ${t}.body,
            ${t}.category_id, c.name AS category, ${t}.tags, ${t}.author,
            ${state}::smallint AS state, ${t}.published_at, ${t}.view_count,
            ${t}.created_by, ${t}.updated_by, ub.username AS updated_by_name, ${t}.created_at, ${t}.updated_at
       FROM ${table} ${t}
       LEFT JOIN article_categories c ON c.id = ${t}.category_id
       LEFT JOIN users ub ON ub.id = ${t}.updated_by`;

  app.get('/articles/:id', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(
      `${articleDetailSql('a', 'articles', 'online', '1')} WHERE a.id=$1`, [(req.params as any).id]);
    if (!rows[0]) return fail(reply, 404, '资讯不存在');
    const state = articleState(rows[0].origin, rows[0].state);
    return ok(reply, {
      ...rows[0], state, state_text: ARTICLE_STATE_TEXT[state],
      readonly: true, readonly_hint: '线上内容只读，需先下线才能修改',
    });
  });

  // 按草稿行 id 取数：草稿与已下线都从这一条路径读，读到的就是它所在的那一行
  app.get('/articles/drafts/:draftId', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(
      `${articleDetailSql('d', 'article_drafts', 'draft', 'd.state')} WHERE d.id=$1`, [(req.params as any).draftId]);
    if (!rows[0]) return fail(reply, 404, '草稿不存在');
    const state = articleState(rows[0].origin, rows[0].state);
    return ok(reply, { ...rows[0], state, state_text: ARTICLE_STATE_TEXT[state] });
  });

  // 旧签名已移除、不留兼容别名：PATCH /articles/:id、POST /articles/:id/publish、
  // POST /articles/:id/discard-draft 与 POST /articles/:id/revision（确保副本行）全部撤销。

  // 下线 = 整行搬回草稿表（11.10）：同一事务内按列插成 state=2 的未发布行，再删除线上行。
  // uid 原样带过去、updated_by 写当次操作人；view_count 与 published_at 随行保留，不清零。
  // 发布表没有这一行，官网立即取不到它——「下线既是状态也是位置」
  app.post('/articles/:id/unpublish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const result = await transaction(async (client) => {
      const a = await client.query(
        'SELECT id,uid,slug,title FROM articles WHERE id=$1 FOR UPDATE', [id]);
      const online = a.rows[0];
      if (!online) return { kind: 'not_found' as const };
      // 同标识的未发布行会让搬运撞 UNIQUE(slug)：先挡下来给可读原因，不静默改名
      const clash = await client.query('SELECT 1 FROM article_drafts WHERE slug=$1 LIMIT 1', [online.slug]);
      if (clash.rows[0]) return { kind: 'slug_draft' as const, slug: online.slug };
      const dup = await client.query('SELECT 1 FROM article_drafts WHERE uid=$1 LIMIT 1', [online.uid]);
      if (dup.rows[0]) return { kind: 'already_offline' as const };

      const ins = await client.query(
        `INSERT INTO article_drafts(${PUBLISH_COLUMNS.join(',')},uid,state,view_count,published_at,created_by,updated_by,created_at,updated_at)
         SELECT ${PUBLISH_COLUMNS.map((c) => `a.${c}`).join(',')},
                a.uid,2,a.view_count,a.published_at,a.created_by,$2,a.created_at,NOW()
           FROM articles a WHERE a.id=$1
           RETURNING id, uid, state, view_count`,
        [id, req.user!.id]);
      if (!ins.rows[0]) return { kind: 'not_found' as const };
      // 删线上行会级联清空该条的浏览判重明细（article_view_dedupe 的 ON DELETE CASCADE）：
      // 后果是重新上线后同一访客可再计一次，本 change 接受这条有界偏差（D6 其四）
      await client.query('DELETE FROM articles WHERE id=$1', [id]);
      return { kind: 'moved' as const, row: ins.rows[0] };
    });

    if (result.kind === 'not_found') return fail(reply, 404, '资讯不存在');
    if (result.kind === 'slug_draft') {
      return fail(reply, 409, `标识「${result.slug}」已被一条未发布内容占用，下线会产生同标识的未发布行，请先处理该内容`, ErrCode.SLUG_EXISTS);
    }
    if (result.kind === 'already_offline') {
      return fail(reply, 409, '该内容身份已有未发布行，无法再次搬运', ErrCode.UNPROCESSABLE);
    }
    await auditArticle(req, 'unpublish', result.row.uid, {
      fields: ['state'], from: { state: 'published' }, to: { state: 'offline' },
    });
    return ok(reply, { draft_id: result.row.id, uid: result.row.uid, view_count: result.row.view_count });
  });

  // 运维兜底端点，不对外使用（11.15）：界面不渲染任何指向它的按钮，正常流程不会产生
  // 「发布行需要删除」的状态——要撤下内容请用下线，要删内容请删未发布侧的行。
  // 语义与下线一致：靠 011 的 ON DELETE CASCADE 清理该条的浏览判重明细，不留孤儿、不报 500
  app.delete('/articles/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ uid: string; dropped_views: number }>(
      `SELECT uid, (SELECT count(*)::int FROM article_view_dedupe WHERE article_id=articles.id) AS dropped_views
         FROM articles WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '资讯不存在');
    await query(`DELETE FROM articles WHERE id=$1`, [id]);
    await auditArticle(req, 'delete', rows[0].uid, { fields: [], from: { state: 'published' }, to: {} });
    return ok(reply, { dropped_views: rows[0].dropped_views });
  });

  // ---------------- 产品分类 ----------------
  // ref_count 跨两张表（已上架 + 草稿与已下架），与删除前置检查同一口径：
  // 只统计发布表会让「仅草稿在用」的分类显示 0 条却被拒，或反过来删掉后把草稿归属清成 NULL
  app.get('/product-categories', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(
      `SELECT c.*, (
            (SELECT count(*)::int FROM products p WHERE p.category_id=c.id)
          + (SELECT count(*)::int FROM product_drafts d WHERE d.category_id=c.id)
         ) AS ref_count
         FROM product_categories c ORDER BY c.sort, c.id`);
    return ok(r, rows);
  });
  // 分类标识与产品标识同构改为服务端生成（design D5 的「标识可变」口径已由「生成后冻结」取代）
  const categorySchema = z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(255).nullish(),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    sort: z.coerce.number().int().min(0).max(999999).default(0),
  });
  app.post('/product-categories', { preHandler: write }, async (req, reply) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '参数错误：名称必填，且各字段长度受限', ErrCode.BAD_REQUEST);
    }
    const b = parsed.data;
    const slug = await genSlug('pc', (s) => isSlugTaken('product_categories', s));
    const { rows } = await query(
      `INSERT INTO product_categories(name,slug,description,parent_id,sort) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [b.name, slug, b.description || null, b.parentId || null, b.sort]);
    return ok(reply, { id: rows[0].id, slug });
  });
  app.patch('/product-categories/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const sets: string[] = []; const p: any[] = []; let i = 1;
    // 标识不在可写列里：创建时生成后即冻结
    for (const k of ['name', 'description', 'parentId', 'sort']) if (b[k] !== undefined) { sets.push(`${k === 'parentId' ? 'parent_id' : k}=$${i++}`); p.push(b[k]); }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    p.push(id);
    await query(`UPDATE product_categories SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  // 删除产品分类：引用计数跨两张表（已上架行 + 草稿与已下架行），非 0 时拒绝并报出数量。
  // 两张表的 category_id 都是 ON DELETE SET NULL，保留它只为「绕过本检查直接改库」的情形兜底。
  app.delete('/product-categories/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ online: number; drafts: number }>(
      `SELECT (SELECT count(*)::int FROM products WHERE category_id=$1) AS online,
              (SELECT count(*)::int FROM product_drafts WHERE category_id=$1) AS drafts`, [id]);
    const total = rows[0].online + rows[0].drafts;
    if (total > 0) {
      return fail(reply, 409,
        `该分类下还有 ${total} 个产品（已上架 ${rows[0].online} 个、未上架 ${rows[0].drafts} 个），请先移动或删除后再删分类`,
        ErrCode.UNPROCESSABLE);
    }
    const { rowCount } = await query(`DELETE FROM product_categories WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '分类不存在');
    return ok(reply);
  });

  // ---------------- 产品 products ----------------
  // 线上只读口径（与资讯链 012 同构，见 design D3）：一条产品同一时刻只存在于一张表。
  // product_drafts 是所有内容编辑与删除的唯一落点（state 0=草稿 / 2=已下架），
  // products 只放正在上架的行——内容列没有任何改写路径，界面对它可做的是查看、下架与调整排序值。
  // 因此本链不提供 POST /products 与 PATCH /products/:id：「改价要先下架」是本轮定的口径。
  // 搬运时逐列写出的内容列：只被发布/下架两条搬运语句使用，不是「覆盖线上行」的 UPDATE 清单。
  // uid / published_at / created_* / sort 之外的身份列由搬运语句单独列出，MUST NOT 交给列默认值重新生成
  const PRODUCT_PUBLISH_COLUMNS = ['slug', 'name', 'category_id', 'series', 'cover_image', 'gallery',
    'summary', 'description', 'specs', 'highlights', 'price_text', 'buy_link', 'sort'] as const;

  // 线上行的可写列只有 sort 一个（design D6）：运营调产品中心顺序不该把产品逐个撤下官网，
  // 除此之外的任何列都不给线上行开写路径。清单显式写出来，防止后来者把它当成「线上行可以 PATCH」的口子
  const PRODUCT_ONLINE_WRITABLE_COLUMNS = ['sort'] as const;

  // 写请求必带内容身份：两表主键各自递增，drafts/7 与 products/7 可以同时存在
  const productUidField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'uid 必须是合法的内容身份标识');

  // 形态上限（design D3 与 spec「形态一致」）：图集 ≤8、规格 ≤20、卖点 ≤8
  const specItemSchema = z.object({ label: z.string().min(1).max(80), value: z.string().max(200) });
  // 空位不提交空串：图片地址与卖点先 trim 再过滤，避免官网渲染出一张 src="" 的图
  const stringListSchema = (max: number, itemMax: number) => z.array(z.string().max(itemMax)).max(max)
    .default([])
    .transform((v) => v.map((s) => s.trim()).filter(Boolean));

  // 草稿可编辑列与 products 一一对应；刻意不含 status——上线只能由发布动作产生。
  // 标识同样不在写入体里：由服务端在创建时生成并落库，此后冻结，外部提交的 slug 被 zod 丢弃
  const productDraftCreateSchema = z.object({
    name: z.string().min(1).max(160),
    // 分类 id 是 bigint 列，node-pg 按字符串回传，编辑器原样提交："5" 与 5 必须是同一个分类
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    // 可空列用 nullish：PATCH 里「传 null = 清空该列」「不传 = 不动该列」必须区分得开
    series: z.string().max(80).nullish(),
    coverImage: z.string().max(500).nullish(),
    gallery: stringListSchema(8, 500),
    summary: z.string().max(400).nullish(),
    description: z.string().max(200000).optional(),
    specs: z.array(specItemSchema).max(20).default([]),
    highlights: stringListSchema(8, 200),
    priceText: z.string().max(60).nullish(),
    buyLink: z.string().max(500).nullish(),
    sort: z.coerce.number().int().min(0).max(999999).default(0),
  });
  const productDraftPatchSchema = productDraftCreateSchema.partial().extend({ uid: productUidField });
  const productUidBodySchema = z.object({ uid: productUidField });
  const productSortSchema = z.object({
    uid: productUidField,
    sort: z.coerce.number().int().min(0).max(999999),
  });

  // zod 字段名 → 表列名（PATCH 的可写列清单；标识不在其中，创建后即冻结）。
  // 两表列名一致，草稿与线上共用同一份映射
  const PRODUCT_DRAFT_FIELDS: [key: string, col: string][] = [
    ['name', 'name'], ['categoryId', 'category_id'], ['series', 'series'],
    ['coverImage', 'cover_image'], ['gallery', 'gallery'], ['summary', 'summary'],
    ['description', 'description'], ['specs', 'specs'], ['highlights', 'highlights'],
    ['priceText', 'price_text'], ['buyLink', 'buy_link'], ['sort', 'sort'],
  ];
  const PRODUCT_JSON_COLUMNS = ['gallery', 'specs', 'highlights'];

  // 详细描述入库统一口径：白名单清洗在前、站外图片剥除在后，与资讯正文同一份判断、同一套白名单
  function cleanProductDescription(raw: unknown): { html: string; stripped: number } {
    const text = String(raw ?? '').trim();
    if (!text) return { html: '', stripped: 0 };
    const { html, removed } = stripForeignImages(sanitize(text));
    return { html, stripped: removed };
  }

  // 存量形态不符时归一为合法空列表/合法项：读侧收口，前端不必再各自兜形（spec「形态一致」）
  function normalizeProductShapes(row: any) {
    const arr = (v: any) => (Array.isArray(v) ? v : []);
    const specs = arr(row.specs)
      .filter((s: any) => s && typeof s === 'object' && typeof s.label === 'string' && s.label.trim())
      .map((s: any) => ({ label: s.label, value: typeof s.value === 'string' ? s.value : String(s.value ?? '') }));
    return { ...row, specs, gallery: arr(row.gallery), highlights: arr(row.highlights).map((s: any) => String(s)) };
  }

  // 行 id 与 uid 是否指向同一条内容：不符一律拒绝，MUST NOT 按 id 猜测（spec「不猜测」场景）
  async function assertProductDraftIdentity(draftId: number, uid: string, reply: any): Promise<boolean> {
    const { rows } = await query<{ uid: string }>(`SELECT uid FROM product_drafts WHERE id=$1`, [draftId]);
    if (!rows[0]) { fail(reply, 404, '未上架产品不存在', ErrCode.NOT_FOUND); return false; }
    if (String(rows[0].uid).toLowerCase() !== uid.toLowerCase()) {
      fail(reply, 409, `行 id 与内容身份不符：未上架表第 ${draftId} 行不是你提交的这条产品，请求已拒绝`, ErrCode.NOT_FOUND);
      return false;
    }
    return true;
  }

  async function assertProductOnlineIdentity(id: number, uid: string, reply: any): Promise<boolean> {
    const { rows } = await query<{ uid: string }>(`SELECT uid FROM products WHERE id=$1`, [id]);
    if (!rows[0]) { fail(reply, 404, '产品不存在', ErrCode.NOT_FOUND); return false; }
    if (String(rows[0].uid).toLowerCase() !== uid.toLowerCase()) {
      fail(reply, 409, `行 id 与内容身份不符：已上架第 ${id} 行不是你提交的这条产品，请求已拒绝`, ErrCode.NOT_FOUND);
      return false;
    }
    return true;
  }

  // 新建未上架产品：只落 product_drafts 的 state=0 行，没有上架时间可言。标识在这一刻生成并与行同笔写入。
  // 界面「保存并发布」= 本接口 + 发布接口两次调用
  app.post('/products/drafts', { preHandler: write }, async (req, reply) => {
    const parsed = productDraftCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path?.[0];
      return fail(reply, 400, field
        ? `参数错误：${String(field)} 不符合要求（${first.message}）`
        : '参数错误：名称必填，规格/图集/卖点有长度与条数上限', ErrCode.BAD_REQUEST);
    }
    const b = parsed.data;
    const slug = await genSlug('p', (s) => isContentSlugTaken('products', 'product_drafts', s));
    const cleaned = cleanProductDescription(b.description ?? '');
    const { rows } = await query<{ id: number; uid: string }>(
      `INSERT INTO product_drafts(slug,name,category_id,series,cover_image,gallery,summary,description,
                                  specs,highlights,price_text,buy_link,sort,state,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$14) RETURNING id, uid`,
      [slug, b.name, b.categoryId ?? null, b.series || null, b.coverImage || null, jsonb(b.gallery),
       b.summary || null, cleaned.html || null, jsonb(b.specs), jsonb(b.highlights),
       b.priceText || null, b.buyLink || null, b.sort, req.user!.id]);
    const uid = String(rows[0].uid);
    await auditProduct(req, 'create', uid, {
      // 标识是服务端本次生成的写入列，照旧进创建审计：清单与改造前逐列一致
      fields: ['slug', ...PRODUCT_DRAFT_FIELDS.map(([, col]) => col)],
      from: {},
      to: {
        slug, name: b.name, category_id: b.categoryId ?? null, series: b.series || null,
        cover_image: b.coverImage || null, gallery: b.gallery, summary: b.summary || null,
        description: bodyDigest(cleaned.html), specs: b.specs, highlights: b.highlights,
        price_text: b.priceText || null, buy_link: b.buyLink || null, sort: b.sort,
      },
    });
    return ok(reply, { id: rows[0].id, uid, slug, stripped_images: cleaned.stripped });
  });

  // 保存未上架产品的改动（草稿与已下架同表同规则）：线上内容根本不在本表的可达范围内
  app.patch('/products/drafts/:draftId', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = productDraftPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path?.[0];
      return fail(reply, 400, field === 'uid'
        ? '缺少或非法的 uid：写请求必须带上这条产品的内容身份标识'
        : field ? `参数错误：${String(field)} 不符合要求（${first.message}）` : '参数错误', ErrCode.BAD_REQUEST);
    }
    if (!(await assertProductDraftIdentity(draftId, parsed.data.uid, reply))) return;
    const b = parsed.data as Record<string, any>;

    const { rows: before } = await query<Record<string, any>>(
      `SELECT slug,name,category_id,series,cover_image,gallery,summary,description,specs,highlights,price_text,buy_link,sort
         FROM product_drafts WHERE id=$1`, [draftId]);
    const sets: string[] = [];
    const p: any[] = [];
    let i = 1;
    let stripped = 0;
    const fields: string[] = [];
    const from: Record<string, any> = {};
    const to: Record<string, any> = {};
    for (const [key, col] of PRODUCT_DRAFT_FIELDS) {
      if (b[key] === undefined) continue;
      let value: any = b[key];
      if (col === 'description') {
        const c = cleanProductDescription(value);
        value = c.html || null;
        stripped = c.stripped;
      } else if (col === 'category_id') {
        value = value ?? null;
      } else if (PRODUCT_JSON_COLUMNS.includes(col)) {
        value = jsonb(value); // 数组必须序列化，否则 PG 按数组字面量写入报 22P02
      } else if (typeof value === 'string') {
        value = value || null;
      }
      sets.push(`${col}=$${i++}`);
      p.push(value);
      // 列照样写入（幂等、便于刷 updated_by），但不因「原值回写」进 diff
      const fromVal = productDigestFor(col, before[0]?.[col]);
      const toVal = productDigestFor(col, PRODUCT_JSON_COLUMNS.includes(col) ? b[key] : value);
      if (diffKey(fromVal) !== diffKey(toVal)) {
        fields.push(col);
        from[col] = fromVal;
        to[col] = toVal;
      }
    }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    sets.push(`updated_by=$${i++}`); p.push(req.user!.id);
    p.push(draftId);
    await query(`UPDATE product_drafts SET ${sets.join(',')} WHERE id=$${i}`, p);
    await auditProduct(req, 'update', parsed.data.uid, { fields, from, to });
    return ok(reply, { stripped_images: stripped });
  });

  // 删除未上架产品（草稿与已下架都走这里）：uid 走查询参数做身份校验。
  // 删除只作用于本表行，MUST NOT 触及任何线上内容——已上架产品要删必须先下架
  app.delete('/products/drafts/:draftId', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = z.object({ uid: productUidField }).safeParse(req.query);
    if (!parsed.success) {
      return fail(reply, 400, '缺少或非法的 uid 查询参数：删除请求必须带上这条产品的内容身份标识', ErrCode.BAD_REQUEST);
    }
    if (!(await assertProductDraftIdentity(draftId, parsed.data.uid, reply))) return;
    const { rows } = await query<{ state: number; slug: string; name: string }>(
      `SELECT state, slug, name FROM product_drafts WHERE id=$1`, [draftId]);
    const { rowCount } = await query(`DELETE FROM product_drafts WHERE id=$1`, [draftId]);
    if (!rowCount) return fail(reply, 404, '未上架产品不存在');
    await auditProduct(req, 'delete', parsed.data.uid, {
      fields: [], from: { slug: rows[0].slug, name: rows[0].name, state: productState('draft', rows[0].state) }, to: {},
    });
    return ok(reply);
  });

  // 发布 = 整行搬运进发布表：同一事务内把未上架行的内容列 + uid + created_* 插成线上行，再删除该行。
  // 首次上架写上上架时间，之后每次再上架都不覆盖；uid MUST NOT 走列默认值重新生成（否则审计历史断线）。
  // 与资讯侧的差别只有一处：产品描述允许为空，所以没有「正文非空」这条下限
  app.post('/products/drafts/:draftId/publish', { preHandler: write }, async (req, reply) => {
    const draftId = Number((req.params as any).draftId);
    const parsed = productUidBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, '缺少或非法的 uid：发布请求必须带上这条产品的内容身份标识', ErrCode.BAD_REQUEST);
    }
    const uid = parsed.data.uid;
    const result = await transaction(async (client) => {
      const d = await client.query(
        'SELECT id,uid,slug,name,state,published_at,sort FROM product_drafts WHERE id=$1 FOR UPDATE', [draftId]);
      const draft = d.rows[0];
      if (!draft) return { kind: 'not_found' as const };
      if (String(draft.uid).toLowerCase() !== uid.toLowerCase()) return { kind: 'identity' as const };
      const clash = await client.query('SELECT 1 FROM products WHERE slug=$1 LIMIT 1', [draft.slug]);
      if (clash.rows[0]) return { kind: 'slug_online' as const, slug: draft.slug };
      // 同一内容身份已有线上行 = 一条内容两处存在，本模型里不可能发生；两表 UNIQUE(uid) 也会挡下
      const dup = await client.query('SELECT 1 FROM products WHERE uid=$1 LIMIT 1', [uid]);
      if (dup.rows[0]) return { kind: 'already_online' as const };

      const ins = await client.query(
        `INSERT INTO products(${PRODUCT_PUBLISH_COLUMNS.join(',')},uid,status,published_at,created_by,updated_by,created_at,updated_at)
         SELECT ${PRODUCT_PUBLISH_COLUMNS.map((c) => `d.${c}`).join(',')},
                d.uid,1,COALESCE(d.published_at,NOW()),d.created_by,$3,d.created_at,NOW()
           FROM product_drafts d WHERE d.id=$1 AND d.uid=$2::uuid
           RETURNING id, uid, published_at, sort`,
        [draftId, uid, req.user!.id]);
      if (!ins.rows[0]) return { kind: 'not_found' as const };
      await client.query('DELETE FROM product_drafts WHERE id=$1', [draftId]);
      return {
        kind: 'moved' as const,
        row: ins.rows[0],
        fromState: productState('draft', draft.state),
        first_published: draft.published_at === null,
      };
    });

    if (result.kind === 'not_found') return fail(reply, 404, '没有可搬运的未上架内容（产品不存在或已被搬运）');
    if (result.kind === 'identity') {
      return fail(reply, 409, `行 id 与内容身份不符：未上架表第 ${draftId} 行不是你提交的这条产品，请求已拒绝`, ErrCode.NOT_FOUND);
    }
    if (result.kind === 'slug_online') {
      return fail(reply, 409, `标识「${result.slug}」与线上产品冲突，请先修改未上架内容的标识`, ErrCode.SLUG_EXISTS);
    }
    if (result.kind === 'already_online') {
      return fail(reply, 409, '该内容身份已有线上行，重复搬运会被拒绝', ErrCode.UNPROCESSABLE);
    }
    await auditProduct(req, 'publish', result.row.uid, {
      fields: ['state'], from: { state: result.fromState }, to: { state: 'published' },
    });
    return ok(reply, {
      id: result.row.id,
      uid: result.row.uid,
      published_at: result.row.published_at,
      sort: result.row.sort,
      first_published: result.first_published,
    });
  });

  // 下架 = 整行搬回未上架表：同一事务内按列插成 state=2 的行，再删除线上行。
  // uid 原样带过去、updated_by 写当次操作人；published_at 与 sort 随行保留，不清零。
  // 发布表没有这一行，官网立即取不到它——「下架既是状态也是位置」
  app.post('/products/:id/unpublish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = productUidBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, '缺少或非法的 uid：下架请求必须带上这条产品的内容身份标识', ErrCode.BAD_REQUEST);
    }
    const result = await transaction(async (client) => {
      const a = await client.query(
        'SELECT id,uid,slug,name FROM products WHERE id=$1 FOR UPDATE', [id]);
      const online = a.rows[0];
      if (!online) return { kind: 'not_found' as const };
      if (String(online.uid).toLowerCase() !== parsed.data.uid.toLowerCase()) return { kind: 'identity' as const };
      // 同标识的未上架行会让搬运撞 UNIQUE(slug)：先挡下来给可读原因，不静默改名
      const clash = await client.query('SELECT 1 FROM product_drafts WHERE slug=$1 LIMIT 1', [online.slug]);
      if (clash.rows[0]) return { kind: 'slug_draft' as const, slug: online.slug };
      const dup = await client.query('SELECT 1 FROM product_drafts WHERE uid=$1 LIMIT 1', [online.uid]);
      if (dup.rows[0]) return { kind: 'already_offline' as const };

      const ins = await client.query(
        `INSERT INTO product_drafts(${PRODUCT_PUBLISH_COLUMNS.join(',')},uid,state,published_at,created_by,updated_by,created_at,updated_at)
         SELECT ${PRODUCT_PUBLISH_COLUMNS.map((c) => `p.${c}`).join(',')},
                p.uid,2,p.published_at,p.created_by,$2,p.created_at,NOW()
           FROM products p WHERE p.id=$1
           RETURNING id, uid, state, published_at`,
        [id, req.user!.id]);
      if (!ins.rows[0]) return { kind: 'not_found' as const };
      // 删线上行会把 inquiries.product_id 置空（ON DELETE SET NULL）：归属由 inquiries.product_uid 承担，
      // 那条线索仍可按内容身份追到搬回未上架表的这一行（design D12）
      await client.query('DELETE FROM products WHERE id=$1', [id]);
      return { kind: 'moved' as const, row: ins.rows[0] };
    });

    if (result.kind === 'not_found') return fail(reply, 404, '产品不存在');
    if (result.kind === 'identity') {
      return fail(reply, 409, `行 id 与内容身份不符：已上架第 ${id} 行不是你提交的这条产品，请求已拒绝`, ErrCode.NOT_FOUND);
    }
    if (result.kind === 'slug_draft') {
      return fail(reply, 409, `标识「${result.slug}」已被一条未上架产品占用，下架会产生同标识的未上架行，请先处理该产品`, ErrCode.SLUG_EXISTS);
    }
    if (result.kind === 'already_offline') {
      return fail(reply, 409, '该内容身份已有未上架行，无法再次搬运', ErrCode.UNPROCESSABLE);
    }
    await auditProduct(req, 'unpublish', result.row.uid, {
      fields: ['state'], from: { state: 'published' }, to: { state: 'offline' },
    });
    return ok(reply, { draft_id: result.row.id, uid: result.row.uid, published_at: result.row.published_at });
  });

  // 调整已上架产品的列表排序值：线上行唯一的写路径，只写 sort 与 updated_by 两列（design D6）。
  // 幂等：重复提交同一个值与提交一次结果相同；内容列与上架时间一律不动
  app.post('/products/:id/sort', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = productSortSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(reply, 400, first?.path?.[0] === 'uid'
        ? '缺少或非法的 uid：调整排序的请求必须带上这条产品的内容身份标识'
        : '排序值不合法：需为 0 到 999999 的整数', ErrCode.BAD_REQUEST);
    }
    if (!(await assertProductOnlineIdentity(id, parsed.data.uid, reply))) return;
    const { rows: before } = await query<{ sort: number }>(`SELECT sort FROM products WHERE id=$1`, [id]);
    const { rows } = await query<{ id: number; uid: string; sort: number }>(
      `UPDATE products SET sort=$2, updated_by=$3 WHERE id=$1 RETURNING id, uid, sort, updated_at`,
      [id, parsed.data.sort, req.user!.id]);
    await auditProduct(req, 'sort', parsed.data.uid, {
      fields: [...PRODUCT_ONLINE_WRITABLE_COLUMNS],
      from: { sort: before[0]?.sort ?? null },
      to: { sort: rows[0].sort },
    });
    return ok(reply, { id: rows[0].id, uid: rows[0].uid, sort: rows[0].sort });
  });

  // 管理列表 = 两张表的并集：一条产品恰好一行，一行只有一个 id 加来源标记 origin。
  // 排序取 (updated_at, origin, id) 全序：两表主键各自递增，只按 id 排会在翻页时重行或漏行
  app.get('/products', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    const kw = keywordOf(q.keyword);
    if (kw) {
      where.push(`(s.name ILIKE $${params.length + 1} OR s.series ILIKE $${params.length + 1})`);
      params.push(`%${escapeLike(kw)}%`);
    }
    if (q.categoryId && Number(q.categoryId) > 0) {
      where.push(`s.category_id=$${params.length + 1}`); params.push(Number(q.categoryId));
    }
    // 状态筛选按「在哪张表 + state」：0=草稿、1=已上架（只可能是发布表）、2=已下架
    const st = statusOf(q.status);
    if (st === 0) where.push(`s.origin='draft' AND s.state=0`);
    else if (st === 1) where.push(`s.origin='online'`);
    else if (st === 2) where.push(`s.origin='draft' AND s.state=2`);
    const { rows, total } = await queryPaginated(
      `SELECT s.id, s.origin, s.uid, s.slug, s.name, s.series, s.category_id, s.cover_image, s.price_text,
              s.state, s.sort, s.published_at, s.updated_by, u.username AS updated_by_name, s.updated_at, s.created_at,
              (SELECT c.name FROM product_categories c WHERE c.id = s.category_id) AS category
         FROM (
             SELECT p.id, 'online'::text AS origin, p.uid, p.slug, p.name, p.series, p.category_id, p.cover_image,
                    p.price_text, 1::smallint AS state, p.sort, p.published_at, p.updated_by, p.updated_at, p.created_at
               FROM products p
             UNION ALL
             SELECT d.id, 'draft'::text, d.uid, d.slug, d.name, d.series, d.category_id, d.cover_image,
                    d.price_text, d.state, d.sort, d.published_at, d.updated_by, d.updated_at, d.created_at
               FROM product_drafts d
         ) s
         LEFT JOIN users u ON u.id = s.updated_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY s.updated_at DESC NULLS LAST, s.origin, s.id DESC`,
      params, pageSize, offset);
    return ok(reply, rows.map((r: any) => {
      const state = productState(r.origin, r.state);
      return { ...r, state, state_text: PRODUCT_STATE_TEXT[state] };
    }), { page, pageSize, total });
  });

  // 单条取数收口：两个端点各读自己那张表的行，不再有「读哪一份」的分支。
  // 线上侧只读，响应明确标注需先下架才能修改；界面据此不渲染编辑与删除入口。
  // 两表列名一致，只按别名生成一次 SELECT
  const productDetailSql = (t: string, table: string, origin: string, state: string) =>
    `SELECT ${t}.id, '${origin}'::text AS origin, ${t}.uid, ${t}.slug, ${t}.name, ${t}.category_id,
            c.name AS category, ${t}.series, ${t}.cover_image, ${t}.gallery, ${t}.summary, ${t}.description,
            ${t}.specs, ${t}.highlights, ${t}.price_text, ${t}.buy_link,
            ${state}::smallint AS state, ${t}.sort, ${t}.published_at,
            ${t}.created_by, ${t}.updated_by, ub.username AS updated_by_name, ${t}.created_at, ${t}.updated_at
       FROM ${table} ${t}
       LEFT JOIN product_categories c ON c.id = ${t}.category_id
       LEFT JOIN users ub ON ub.id = ${t}.updated_by`;

  app.get('/products/:id', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(
      `${productDetailSql('p', 'products', 'online', '1')} WHERE p.id=$1`, [(req.params as any).id]);
    if (!rows[0]) return fail(reply, 404, '产品不存在');
    const state = productState(rows[0].origin, rows[0].state);
    return ok(reply, {
      ...normalizeProductShapes(rows[0]), state, state_text: PRODUCT_STATE_TEXT[state],
      readonly: true, readonly_hint: '已上架产品只读，需先下架才能修改内容或删除',
    });
  });

  // 按未上架行 id 取数：草稿与已下架都从这一条路径读，读到的就是它所在的那一行
  app.get('/products/drafts/:draftId', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(
      `${productDetailSql('d', 'product_drafts', 'draft', 'd.state')} WHERE d.id=$1`, [(req.params as any).draftId]);
    if (!rows[0]) return fail(reply, 404, '未上架产品不存在');
    const state = productState(rows[0].origin, rows[0].state);
    return ok(reply, { ...normalizeProductShapes(rows[0]), state, state_text: PRODUCT_STATE_TEXT[state] });
  });

  // 旧签名已移除、不留兼容别名：POST /products 与 PATCH /products/:id（含其 status 旁路）全部撤销。

  // 运维兜底端点，不对外使用：界面不渲染任何指向它的按钮，正常流程不会产生
  // 「线上行需要删除」的状态——要撤下内容请用下架，要删内容请删未上架侧的行。
  // 删线上行会把 inquiries.product_id 置空（ON DELETE SET NULL），返回该数量供运维判断影响面
  app.delete('/products/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ uid: string; cleared_inquiries: number }>(
      `SELECT uid, (SELECT count(*)::int FROM inquiries WHERE product_id=products.id) AS cleared_inquiries
         FROM products WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '产品不存在');
    await query(`DELETE FROM products WHERE id=$1`, [id]);
    await auditProduct(req, 'delete', rows[0].uid, { fields: [], from: { state: 'published' }, to: {} });
    return ok(reply, { cleared_inquiries: rows[0].cleared_inquiries });
  });

  // ---------------- Banner ----------------
  app.get('/banners', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT * FROM banners ORDER BY position, sort, id`);
    return ok(r, rows);
  });
  app.post('/banners', { preHandler: write }, async (req, reply) => {
    const b = z.object({ title: z.string().optional(), imageUrl: z.string(), linkUrl: z.string().optional(),
      position: z.string().default('home'), sort: z.coerce.number().default(0), status: z.coerce.number().min(0).max(1).default(1),
      startAt: z.string().optional(), endAt: z.string().optional() }).parse(req.body);
    const { rows } = await query(
      `INSERT INTO banners(title,image_url,link_url,position,sort,status,start_at,end_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.title || null, b.imageUrl, b.linkUrl || null, b.position, b.sort, b.status,
       b.startAt ? new Date(b.startAt) : null, b.endAt ? new Date(b.endAt) : null]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/banners/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    const map: Record<string, string> = { title: 'title', imageUrl: 'image_url', linkUrl: 'link_url', position: 'position', sort: 'sort', status: 'status' };
    for (const k of Object.keys(map)) if (b[k] !== undefined) { sets.push(`${map[k]}=$${i++}`); p.push(b[k]); }
    p.push(id);
    await query(`UPDATE banners SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  app.delete('/banners/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM banners WHERE id=$1`, [(req.params as any).id]);
    return ok(reply);
  });

  // ---------------- FAQ ----------------
  app.get('/faqs', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT * FROM faqs ORDER BY category, sort, id`);
    return ok(r, rows);
  });
  app.post('/faqs', { preHandler: write }, async (req, reply) => {
    const b = z.object({ question: z.string(), answer: z.string(), category: z.string().default('general'),
      sort: z.coerce.number().default(0), status: z.coerce.number().min(0).max(1).default(1) }).parse(req.body);
    const { rows } = await query(`INSERT INTO faqs(question,answer,category,sort,status) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [b.question, sanitize(b.answer), b.category, b.sort, b.status]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/faqs/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    for (const [k, col] of [['question', 'question'], ['answer', 'answer'], ['category', 'category'], ['sort', 'sort'], ['status', 'status']] as [string, string][]) {
      if (b[k] !== undefined) { sets.push(`${col}=$${i++}`); p.push(k === 'answer' ? sanitize(b[k]) : b[k]); }
    }
    p.push(id);
    await query(`UPDATE faqs SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  app.delete('/faqs/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM faqs WHERE id=$1`, [(req.params as any).id]);
    return ok(reply);
  });

  // ---------------- 站点设置 ----------------
  app.get('/settings', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT key,value,group_name,label FROM site_settings`);
    const grouped: Record<string, any> = {};
    for (const row of rows) {
      (grouped[row.group_name] ??= {})[row.key] = { value: row.value, label: row.label };
    }
    return ok(r, grouped);
  });
  // upsert：已存在的 key 仅更新 value；新 key 需带 groupName/label 一并建档
  app.patch('/settings', { preHandler: write }, async (req, reply) => {
    const parsed = z.array(z.object({
      key: z.string().min(1).max(80),
      value: z.string().max(4000),
      groupName: z.string().min(1).max(40).optional(),
      label: z.string().max(80).optional(),
    })).min(1).max(200).safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    let inserted = 0; let updated = 0;
    for (const it of parsed.data) {
      const { rows } = await query(
        `INSERT INTO site_settings(key,value,group_name,label) VALUES($1,$2,$3,$4)
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
         RETURNING (xmax = 0) AS is_new`,
        [it.key, it.value, it.groupName || 'general', it.label || null]);
      if (rows[0]?.is_new) inserted++; else updated++;
    }
    await audit(req, 'update', 'setting', 'bulk');
    return ok(reply, { inserted, updated });
  });

  // ---------------- 导航菜单（树） ----------------
  app.get('/menus', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT * FROM menus ORDER BY parent_id NULLS FIRST, sort, id`);
    const map = new Map<number, any>();
    const tree: any[] = [];
    rows.forEach((row: any) => map.set(row.id, { ...row, children: [] }));
    rows.forEach((row: any) => {
      const node = map.get(row.id);
      if (row.parent_id && map.has(row.parent_id)) map.get(row.parent_id).children.push(node);
      else tree.push(node);
    });
    return ok(r, tree);
  });
  app.post('/menus', { preHandler: write }, async (req, reply) => {
    const b = z.object({
      parentId: z.coerce.number().optional(), title: z.string().min(1),
      url: z.string().optional().nullable(), target: z.string().default('_self'),
      location: z.enum(MENU_LOCATIONS).default('header'),
      sort: z.coerce.number().default(0), status: z.coerce.number().min(0).max(1).default(1),
    }).parse(req.body);
    // 子项归入父级所在的导航位，避免一棵树跨位渲染
    let location: string = b.location;
    if (b.parentId) {
      const { rows } = await query<{ location: string }>('SELECT location FROM menus WHERE id=$1', [b.parentId]);
      if (!rows[0]) return fail(reply, 400, '上级菜单不存在', ErrCode.RELATION_NOT_FOUND);
      location = rows[0].location;
    }
    // 仅页脚的顶级列标题允许无链接，其余导航位必须可点击
    if (!b.url && !(location === 'footer' && !b.parentId)) {
      return fail(reply, 400, '请填写导航链接（仅页脚列标题可留空）', ErrCode.BAD_REQUEST);
    }
    const { rows } = await query(`INSERT INTO menus(parent_id,title,url,target,location,sort,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [b.parentId || null, b.title, b.url || null, b.target, location, b.sort, b.status]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/menus/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    if (b.location !== undefined && !MENU_LOCATIONS.includes(b.location)) {
      return fail(reply, 400, `导航位置只能是 ${MENU_LOCATIONS.join('/')}`, ErrCode.BAD_REQUEST);
    }
    const { rows: cur } = await query<{ parent_id: number | null }>('SELECT parent_id FROM menus WHERE id=$1', [id]);
    if (!cur[0]) return fail(reply, 404, '菜单不存在', ErrCode.NOT_FOUND);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    const map: Record<string, string> = { parentId: 'parent_id', title: 'title', url: 'url', target: 'target', location: 'location', sort: 'sort', status: 'status' };
    for (const k of Object.keys(map)) {
      if (b[k] === undefined) continue;
      // 子项的导航位由父级决定，忽略入参
      if (k === 'location' && cur[0].parent_id) continue;
      sets.push(`${map[k]}=$${i++}`);
      p.push(map[k] === 'url' && b[k] === '' ? null : b[k]);
    }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    p.push(id);
    await query(`UPDATE menus SET ${sets.join(',')} WHERE id=$${i}`, p);
    // 顶级项改位需带上整棵子树，否则子项会留在原导航位
    if (b.location !== undefined && !cur[0].parent_id) {
      await query(
        `WITH RECURSIVE sub AS (SELECT id FROM menus WHERE id=$1
           UNION ALL SELECT m.id FROM menus m JOIN sub s ON m.parent_id=s.id)
         UPDATE menus SET location=$2 WHERE id IN (SELECT id FROM sub)`, [id, b.location]);
    }
    return ok(reply);
  });
  // 删除保护（与前端 menus.vue 的删除规则同口径）：
  //   1. 右上角 CTA 与顶栏固定行（首页/关于/产品/资讯/联系）由代码维护，不可删除；
  //   2. 页面已发布（status=1）时其顶栏导航不可删除——官网正在引用，删除即产生死链，
  //      需先到「页面装修」下线；
  //   3. 其余（未发布页面的顶栏行、页脚分组/子项）可自由删除。
  app.delete('/menus/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query<{ location: string; url: string | null }>(
      'SELECT location, url FROM menus WHERE id=$1', [id]);
    const m = rows[0];
    if (!m) return fail(reply, 404, '菜单不存在', ErrCode.NOT_FOUND);
    if (m.location === 'cta') {
      return fail(reply, 400, '右上角按钮为固定项，不可删除', ErrCode.BAD_REQUEST);
    }
    if (m.location === 'header') {
      // 顶栏行 url → 页面 slug：首页行为 '/'，其余为 '/{slug}'
      const slug = m.url === '/' ? 'home' : (m.url ?? '').replace(/^\//, '');
      if ((FIXED_PAGE_SLUGS as readonly string[]).includes(slug)) {
        return fail(reply, 400, '固定导航项由代码维护，不可删除', ErrCode.BAD_REQUEST);
      }
      const { rows: pg } = await query<{ status: number }>('SELECT status FROM pages WHERE slug=$1', [slug]);
      if (pg[0]?.status === 1) {
        return fail(reply, 400, `页面「${slug}」已发布，导航菜单不可删除；请先在「页面装修」下线`, ErrCode.BAD_REQUEST);
      }
    }
    await query(`DELETE FROM menus WHERE id=$1`, [id]);
    await audit(req, 'delete', 'menu', id);
    return ok(reply);
  });

  // ---------------- 媒体库 ----------------
  app.get('/media', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    if (q.category) { where.push(`category=$${params.length + 1}`); params.push(String(q.category).slice(0, 40)); }
    const kw = keywordOf(q.keyword);
    if (kw) { where.push(`(original_name ILIKE $${params.length + 1} OR filename ILIKE $${params.length + 1})`); params.push(`%${escapeLike(kw)}%`); }
    const { rows, total } = await queryPaginated(
      `SELECT * FROM media ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`,
      params, pageSize, offset);
    const { rows: cats } = await query(`SELECT DISTINCT category FROM media WHERE category IS NOT NULL ORDER BY category`);
    return ok(reply, rows, { page, pageSize, total, categories: cats.map((c: any) => c.category) });
  });
  app.post('/media', { preHandler: write }, async (req, reply) => {
    const b = z.object({ objectKey: z.string(), originalName: z.string().optional(), mimeType: z.string().optional(),
      size: z.coerce.number().optional(), width: z.coerce.number().optional(), height: z.coerce.number().optional(),
      category: z.string().default('general') }).parse(req.body);
    const { rows } = await query(
      `INSERT INTO media(filename,original_name,mime_type,size,width,height,bucket,object_key,url,category,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,url`,
      [b.objectKey.split('/').pop(), b.originalName || null, b.mimeType || null, b.size || null, b.width || null,
       b.height || null, 'website', b.objectKey, publicUrl(b.objectKey), b.category, req.user!.id]);
    return ok(reply, rows[0]);
  });
  // 素材改名 / 归类（不改动访问 URL，避免已发布内容失效）
  app.patch('/media/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id); const b = req.body as any;
    const sets: string[] = []; const p: any[] = []; let i = 1;
    for (const [k, col] of [['originalName', 'original_name'], ['category', 'category']] as [string, string][]) {
      if (b[k] !== undefined) { sets.push(`${col}=$${i++}`); p.push(b[k]); }
    }
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    p.push(id);
    const { rowCount } = await query(`UPDATE media SET ${sets.join(',')} WHERE id=$${i}`, p);
    if (!rowCount) return fail(reply, 404, '素材不存在', ErrCode.NOT_FOUND);
    await audit(req, 'update', 'media', id);
    return ok(reply);
  });
  // 删除素材：先扫描内容引用，未被引用才删记录并尽力清除物理文件
  app.delete('/media/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rows } = await query(`SELECT object_key FROM media WHERE id=$1`, [id]);
    if (!rows[0]) return fail(reply, 404, '素材不存在', ErrCode.NOT_FOUND);
    const objectKey = String(rows[0].object_key);
    const refs = await findMediaRefs(objectKey);
    if (refs.length) {
      return fail(reply, 409, `该素材正被引用，请先调整相关内容后再删除：${refs.join('、')}`, ErrCode.MEDIA_IN_USE);
    }
    await query(`DELETE FROM media WHERE id=$1`, [id]);
    await removeObject(objectKey).catch(() => { /* 物理文件清除失败不阻断：记录已删，孤儿文件可后台清理 */ });
    await audit(req, 'delete', 'media', id);
    return ok(reply);
  });

  // ---------------- 批量排序（上下移/拖拽后整体提交，单事务保证原子性） ----------------
  function registerReorder(path: string, table: string, entity: string) {
    app.post(`/${path}/reorder`, { preHandler: write }, async (req, reply) => {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) return fail(reply, 400, '参数错误');
      const items = parsed.data.items;
      await transaction(async (client) => {
        for (const it of items) {
          await client.query(`UPDATE ${table} SET sort=$1 WHERE id=$2`, [it.sort, it.id]);
        }
      });
      await audit(req, 'reorder', entity, items.map((i) => i.id).join(','));
      return ok(reply, { updated: items.length });
    });
  }
  registerReorder('banners', 'banners', 'banner');
  registerReorder('faqs', 'faqs', 'faq');
  registerReorder('menus', 'menus', 'menu');
  registerReorder('product-categories', 'product_categories', 'product_category');
  registerReorder('article-categories', 'article_categories', 'article_category');

  // ---------------- 审计日志 ----------------
  app.get('/audit', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    if (q.entityType) { where.push(`a.entity_type=$${params.length + 1}`); params.push(String(q.entityType).slice(0, 40)); }
    if (q.action) { where.push(`a.action=$${params.length + 1}`); params.push(String(q.action).slice(0, 40)); }
    // 按身份标识精确取一条内容的完整时间线：跨两次换表（下线搬进草稿表、发布搬回发布表）
    // 行 id 会变、uid 不变，所以只有 uid 能把这条链串起来；entity_id 存的就是它
    if (q.entityUid) {
      const uid = String(q.entityUid).trim().slice(0, 36);
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uid))
        return fail(reply, 400, 'entityUid 需为合法的标识格式');
      where.push(`a.entity_id=$${params.length + 1}`); params.push(uid);
    }
    const kw = keywordOf(q.keyword);
    if (kw) { where.push(`(a.entity_id ILIKE $${params.length + 1} OR a.ip ILIKE $${params.length + 1} OR COALESCE(u.username, '') ILIKE $${params.length + 1})`); params.push(`%${escapeLike(kw)}%`); }
    const { rows, total } = await queryPaginated(
      `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });
}
