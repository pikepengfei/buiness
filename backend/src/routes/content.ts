import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryPaginated, transaction } from '../db.js';
import { fail, ok, paginate, sanitize, escapeLike, keywordOf, statusOf, jsonb } from '../lib.js';
import { authPreHandler, requirePerm, getClientInfo } from '../middleware/auth.js';
import { publicUrl, removeObject } from '../storage.js';
import { ErrCode } from '../errors.js';

const read = [authPreHandler, requirePerm('content:read')];
const write = [authPreHandler, requirePerm('content:write')];

// 递归清洗 content_json 中的字符串叶子（防 XSS）
function deepSanitize(value: any): any {
  if (typeof value === 'string') return sanitize(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value && typeof value === 'object') {
    const o: any = {};
    for (const k of Object.keys(value)) o[k] = deepSanitize(value[k]);
    return o;
  }
  return value;
}

// 区块结构校验：仅校验骨架 { blocks: [{ id, type, visible, props }] }，
// 具体 type 与各 props 由前端 sectionRegistry 定义，后端不重复维护类型清单。
const blocksSchema = z.object({
  blocks: z.array(z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(40),
    visible: z.boolean().default(true),
    props: z.record(z.any()).default({}),
  })).max(200).default([]),
});
function validateBlocks(raw: any): { ok: true; data: any } | { ok: false; msg: string } {
  const parsed = blocksSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  const at = Array.isArray(first?.path) ? first.path.join('.') : '';
  return { ok: false, msg: `区块数据不合法${at ? `（${at}）` : ''}：需为 { blocks: [{ id, type, visible, props }] }` };
}

function audit(req: any, action: string, type: string, id: any) {
  const { ip } = getClientInfo(req);
  return query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,ip) VALUES($1,$2,$3,$4,$5)`,
    [req.user?.id ?? null, action, type, String(id), ip]);
}

// 批量排序请求体：[{ id, sort }]
const reorderSchema = z.object({
  items: z.array(z.object({ id: z.coerce.number().int().positive(), sort: z.coerce.number().int().min(0).max(999999) }))
    .min(1).max(500),
});

// 素材引用扫描：objectKey 是访问 URL 的子串，整行转文本匹配即可同时覆盖两种存法。
// 表名为字面量白名单，不含外部输入。
const MEDIA_REF_TARGETS: [table: string, labelCol: string][] = [
  ['pages', 'slug'], ['products', 'slug'], ['articles', 'slug'], ['banners', 'position'],
];
async function findMediaRefs(objectKey: string): Promise<string[]> {
  const like = `%${escapeLike(objectKey)}%`;
  const refs: string[] = [];
  for (const [table, labelCol] of MEDIA_REF_TARGETS) {
    const { rows } = await query(
      `SELECT ${labelCol} AS ref FROM ${table} WHERE ${table}::text LIKE $1 LIMIT 5`, [like]);
    if (rows.length) refs.push(`${table}(${rows.map((r: any) => r.ref).join(',')})`);
  }
  return refs;
}

export async function contentRoutes(app: FastifyInstance) {

  // 集中校验所有 :id 路由参数为正向整数，避免 NaN 进入 SQL
  app.addHook('preHandler', async (req, reply) => {
    const raw = (req.params as any).id;
    if (raw === undefined) return; // 非 :id 路由跳过
    if (!/^\d+$/.test(String(raw)) || Number(raw) <= 0) {
      return fail(reply, 400, '路径参数 id 非法', ErrCode.BAD_REQUEST);
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
  app.post('/pages', { preHandler: write }, async (req, reply) => {
    const s = z.object({
      slug: z.string().min(1).max(80), title: z.string().min(1).max(120),
      metaTitle: z.string().max(160).optional(), metaDescription: z.string().max(300).optional(),
      heroImage: z.string().optional(), status: z.coerce.number().min(0).max(1).default(0),
      contentJson: z.any().default({}),
    }).safeParse(req.body);
    if (!s.success) return fail(reply, 400, '参数错误');
    const b = s.data;
    if (!(await assertSlugFree('pages', b.slug, reply))) return;
    const v = validateBlocks(b.contentJson);
    if (!v.ok) return fail(reply, 400, v.msg, ErrCode.BAD_REQUEST);
    const cleaned = deepSanitize(v.data);
    const { rows } = await query(
      `INSERT INTO pages(slug,title,meta_title,meta_description,hero_image,status,published_at,content_json,draft_json,created_by)
       VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $9 THEN NOW() ELSE NULL END,$7,$7,$8) RETURNING id`,
      [b.slug, b.title, b.metaTitle || null, b.metaDescription || null, b.heroImage || null, b.status,
       jsonb(cleaned), req.user!.id, b.status === 1]);
    await audit(req, 'create', 'page', rows[0].id);
    return ok(reply, { id: rows[0].id });
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
  app.delete('/pages/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM pages WHERE id=$1`, [(req.params as any).id]);
    await audit(req, 'delete', 'page', (req.params as any).id);
    return ok(reply);
  });

  // ---------------- 资讯分类 ----------------
  app.get('/article-categories', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT * FROM article_categories ORDER BY sort, id`);
    return ok(r, rows);
  });
  app.post('/article-categories', { preHandler: write }, async (req, reply) => {
    const b = z.object({ name: z.string(), slug: z.string(), description: z.string().optional(), sort: z.coerce.number().default(0) }).parse(req.body);
    const { rows } = await query(`INSERT INTO article_categories(name,slug,description,sort) VALUES($1,$2,$3,$4) RETURNING id`,
      [b.name, b.slug, b.description || null, b.sort]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/article-categories/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    for (const k of ['name', 'slug', 'description', 'sort']) if (b[k] !== undefined) { sets.push(`${k}=$${i++}`); p.push(b[k]); }
    p.push(id);
    await query(`UPDATE article_categories SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  app.delete('/article-categories/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM article_categories WHERE id=$1`, [(req.params as any).id]);
    return ok(reply);
  });

  // ---------------- 资讯 articles ----------------
  app.get('/articles', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    const kw = keywordOf(q.keyword);
    if (kw) { where.push(`(title ILIKE $${params.length + 1} OR summary ILIKE $${params.length + 1})`); params.push(`%${escapeLike(kw)}%`); }
    if (q.categoryId && Number(q.categoryId) > 0) { where.push(`category_id=$${params.length + 1}`); params.push(Number(q.categoryId)); }
    const st = statusOf(q.status);
    if (st !== null) { where.push(`status=$${params.length + 1}`); params.push(st); }
    const { rows, total } = await queryPaginated(
      `SELECT id,slug,title,cover_image,category_id,status,published_at,view_count,created_at
         FROM articles ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY published_at DESC NULLS LAST, created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });
  app.post('/articles', { preHandler: write }, async (req, reply) => {
    const b = z.object({
      slug: z.string(), title: z.string(), coverImage: z.string().optional(),
      summary: z.string().optional(), body: z.string().optional(), categoryId: z.coerce.number().optional(),
      tags: z.array(z.string()).default([]), author: z.string().optional(),
      status: z.coerce.number().min(0).max(2).default(0),
    }).parse(req.body);
    if (!(await assertSlugFree('articles', b.slug, reply))) return;
    const { rows } = await query(
      `INSERT INTO articles(slug,title,cover_image,summary,body,category_id,tags,author,status,published_at,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $10 THEN NOW() ELSE NULL END,$11) RETURNING id`,
      [b.slug, b.title, b.coverImage || null, b.summary || null, sanitize(b.body || ''),
       b.categoryId || null, jsonb(b.tags), b.author || null, b.status, b.status === 1, req.user!.id]);
    await audit(req, 'create', 'article', rows[0].id);
    return ok(reply, { id: rows[0].id });
  });
  app.get('/articles/:id', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(`SELECT * FROM articles WHERE id=$1`, [(req.params as any).id]);
    if (!rows[0]) return fail(reply, 404, '文章不存在');
    return ok(reply, rows[0]);
  });
  app.patch('/articles/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id); const b = req.body as any;
    const sets: string[] = []; const p: any[] = []; let i = 1;
    for (const [k, col] of [['title', 'title'], ['coverImage', 'cover_image'], ['summary', 'summary'],
      ['categoryId', 'category_id'], ['tags', 'tags'], ['author', 'author'], ['status', 'status']] as [string, string][]) {
      if (b[k] !== undefined) { sets.push(`${col}=$${i++}`); p.push(col === 'tags' ? jsonb(b[k]) : b[k]); }
    }
    if (b.body !== undefined) { sets.push(`body=$${i++}`); p.push(sanitize(b.body)); }
    if (b.status === 1) sets.push(`published_at=CASE WHEN published_at IS NULL THEN NOW() ELSE published_at END`);
    if (!sets.length) return fail(reply, 400, '无更新字段', ErrCode.NO_UPDATE_FIELD);
    p.push(id);
    await query(`UPDATE articles SET ${sets.join(',')} WHERE id=$${i}`, p);
    await audit(req, 'update', 'article', id);
    return ok(reply);
  });
  app.post('/articles/:id/publish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rowCount } = await query(`UPDATE articles SET status=1, published_at=COALESCE(published_at,NOW()) WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '文章不存在');
    await audit(req, 'publish', 'article', id);
    return ok(reply);
  });
  // 下线：status=2（已下线），公开接口按 status=1 过滤后官网不再展示
  app.post('/articles/:id/unpublish', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { rowCount } = await query(`UPDATE articles SET status=2 WHERE id=$1`, [id]);
    if (!rowCount) return fail(reply, 404, '文章不存在');
    await audit(req, 'unpublish', 'article', id);
    return ok(reply);
  });
  app.delete('/articles/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM articles WHERE id=$1`, [(req.params as any).id]);
    await audit(req, 'delete', 'article', (req.params as any).id);
    return ok(reply);
  });

  // ---------------- 产品分类 ----------------
  app.get('/product-categories', { preHandler: read }, async (_q, r) => {
    const { rows } = await query(`SELECT * FROM product_categories ORDER BY sort, id`);
    return ok(r, rows);
  });
  app.post('/product-categories', { preHandler: write }, async (req, reply) => {
    const b = z.object({ name: z.string(), slug: z.string(), description: z.string().optional(), parentId: z.coerce.number().optional(), sort: z.coerce.number().default(0) }).parse(req.body);
    const { rows } = await query(`INSERT INTO product_categories(name,slug,description,parent_id,sort) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [b.name, b.slug, b.description || null, b.parentId || null, b.sort]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/product-categories/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    for (const k of ['name', 'slug', 'description', 'parentId', 'sort']) if (b[k] !== undefined) { sets.push(`${k === 'parentId' ? 'parent_id' : k}=$${i++}`); p.push(b[k]); }
    p.push(id);
    await query(`UPDATE product_categories SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  app.delete('/product-categories/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM product_categories WHERE id=$1`, [(req.params as any).id]);
    return ok(reply);
  });

  // ---------------- 产品 products ----------------
  app.get('/products', { preHandler: read }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    const kw = keywordOf(q.keyword);
    if (kw) { where.push(`(name ILIKE $${params.length + 1} OR series ILIKE $${params.length + 1})`); params.push(`%${escapeLike(kw)}%`); }
    if (q.categoryId && Number(q.categoryId) > 0) { where.push(`category_id=$${params.length + 1}`); params.push(Number(q.categoryId)); }
    const st = statusOf(q.status);
    if (st !== null) { where.push(`status=$${params.length + 1}`); params.push(st); }
    const { rows, total } = await queryPaginated(
      `SELECT id,slug,name,series,category_id,cover_image,status,sort,created_at
         FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY sort, created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });
  app.post('/products', { preHandler: write }, async (req, reply) => {
    const b = z.object({
      slug: z.string(), name: z.string(), categoryId: z.coerce.number().optional(), series: z.string().optional(),
      coverImage: z.string().optional(), gallery: z.array(z.string()).default([]), summary: z.string().optional(),
      description: z.string().optional(), specs: z.any().default({}), highlights: z.array(z.string()).default([]),
      priceText: z.string().optional(), buyLink: z.string().optional(), status: z.coerce.number().min(0).max(1).default(1),
      sort: z.coerce.number().default(0),
    }).parse(req.body);
    if (!(await assertSlugFree('products', b.slug, reply))) return;
    const { rows } = await query(
      `INSERT INTO products(slug,name,category_id,series,cover_image,gallery,summary,description,specs,highlights,price_text,buy_link,status,sort,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [b.slug, b.name, b.categoryId || null, b.series || null, b.coverImage || null, jsonb(b.gallery), b.summary || null,
       b.description || null, jsonb(b.specs), jsonb(b.highlights), b.priceText || null, b.buyLink || null, b.status, b.sort, req.user!.id]);
    await audit(req, 'create', 'product', rows[0].id);
    return ok(reply, { id: rows[0].id });
  });
  app.get('/products/:id', { preHandler: read }, async (req, reply) => {
    const { rows } = await query(`SELECT * FROM products WHERE id=$1`, [(req.params as any).id]);
    if (!rows[0]) return fail(reply, 404, '产品不存在');
    return ok(reply, rows[0]);
  });
  app.patch('/products/:id', { preHandler: write }, async (req, reply) => {
    const id = Number((req.params as any).id); const b = req.body as any;
    const sets: string[] = []; const p: any[] = []; let i = 1;
    const map: Record<string, string> = { name: 'name', categoryId: 'category_id', series: 'series', coverImage: 'cover_image',
      gallery: 'gallery', summary: 'summary', description: 'description', specs: 'specs', highlights: 'highlights',
      priceText: 'price_text', buyLink: 'buy_link', status: 'status', sort: 'sort' };
    for (const k of Object.keys(map)) if (b[k] !== undefined) {
      const col = map[k];
      sets.push(`${col}=$${i++}`);
      p.push(['gallery', 'specs', 'highlights'].includes(col) ? jsonb(b[k]) : b[k]);
    }
    if (!sets.length) return fail(reply, 400, '无更新字段');
    p.push(id);
    await query(`UPDATE products SET ${sets.join(',')} WHERE id=$${i}`, p);
    await audit(req, 'update', 'product', id);
    return ok(reply);
  });
  app.delete('/products/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM products WHERE id=$1`, [(req.params as any).id]);
    await audit(req, 'delete', 'product', (req.params as any).id);
    return ok(reply);
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
    const b = z.object({ parentId: z.coerce.number().optional(), title: z.string(), url: z.string(),
      target: z.string().default('_self'), sort: z.coerce.number().default(0), status: z.coerce.number().min(0).max(1).default(1) }).parse(req.body);
    const { rows } = await query(`INSERT INTO menus(parent_id,title,url,target,sort,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.parentId || null, b.title, b.url, b.target, b.sort, b.status]);
    return ok(reply, { id: rows[0].id });
  });
  app.patch('/menus/:id', { preHandler: write }, async (req, reply) => {
    const b = req.body as any; const id = Number((req.params as any).id);
    const sets: string[] = []; const p: any[] = []; let i = 1;
    const map: Record<string, string> = { parentId: 'parent_id', title: 'title', url: 'url', target: 'target', sort: 'sort', status: 'status' };
    for (const k of Object.keys(map)) if (b[k] !== undefined) { sets.push(`${map[k]}=$${i++}`); p.push(b[k]); }
    p.push(id);
    await query(`UPDATE menus SET ${sets.join(',')} WHERE id=$${i}`, p);
    return ok(reply);
  });
  app.delete('/menus/:id', { preHandler: write }, async (req, reply) => {
    await query(`DELETE FROM menus WHERE id=$1`, [(req.params as any).id]);
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
    const kw = keywordOf(q.keyword);
    if (kw) { where.push(`(a.entity_id ILIKE $${params.length + 1} OR a.ip ILIKE $${params.length + 1} OR COALESCE(u.username, '') ILIKE $${params.length + 1})`); params.push(`%${escapeLike(kw)}%`); }
    const { rows, total } = await queryPaginated(
      `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });
}
