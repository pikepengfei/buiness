import type { FastifyInstance } from 'fastify';
import { query, queryPaginated } from '../db.js';
import { ok, paginate, fail, escapeLike } from '../lib.js';
import { config } from '../config.js';
import { ErrCode } from '../errors.js';

export async function publicRoutes(app: FastifyInstance) {

  // 分类筛选参数：数字按 category_id 处理，其余按分类 slug 解析
  // （管理端与官网前台统一用 slug 传参，若直接 Number(slug) 会得到 NaN 并使查询报错）
  function categoryCond(catTable: string, col: string, raw: unknown, params: any[]): string | null {
    const s = String(raw);
    if (/^\d+$/.test(s) && Number(s) > 0) {
      params.push(Number(s));
      return `${col}=$${params.length}`;
    }
    params.push(s.slice(0, 100));
    return `${col}=(SELECT id FROM ${catTable} WHERE slug=$${params.length})`;
  }

  // 为所有 /public/* 只读接口附加短缓存头，降低重复查询压力（可经 PUBLIC_CACHE_MAX_AGE 调整/禁用）
  app.addHook('onSend', async (_req, reply, payload) => {
    // 页面装修内容要求「发布即时生效」：处理器已显式设定缓存头时不再覆盖
    if (config.publicCacheMaxAge > 0 && _req.url.includes('/public') && !reply.hasHeader('cache-control')) {
      reply.header('cache-control', `public, max-age=${config.publicCacheMaxAge}, s-maxage=${config.publicCacheMaxAge}, stale-while-revalidate=30`);
    }
    return payload;
  });

  // 站点全局配置 + 导航 + 品牌色
  app.get('/public/site', async (_req, reply) => {
    const { rows: settings } = await query(`SELECT key,value,group_name,label FROM site_settings`);
    const grouped: Record<string, any> = {};
    for (const r of settings) (grouped[r.group_name] ??= {})[r.key] = r.value;
    const { rows: menus } = await query(`SELECT * FROM menus WHERE status=1 ORDER BY parent_id NULLS FIRST, sort`);
    const map = new Map<number, any>(); const tree: any[] = [];
    menus.forEach((m: any) => map.set(m.id, { ...m, children: [] }));
    menus.forEach((m: any) => {
      const node = map.get(m.id);
      if (m.parent_id && map.has(m.parent_id)) map.get(m.parent_id).children.push(node);
      else tree.push(node);
    });
    return ok(reply, { settings: grouped, menus: tree });
  });

  app.get('/public/banners', async (req, reply) => {
    const position = (req.query as any).position || 'home';
    const { rows } = await query(
      `SELECT id,title,image_url,link_url,position FROM banners
        WHERE status=1 AND position=$1 AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW())
        ORDER BY sort`, [position]);
    return ok(reply, rows);
  });

  // 产品列表（公开）
  app.get('/public/products', async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const category = (req.query as any).category;
    const keyword = (req.query as any).keyword;
    const sort = (req.query as any).sort === 'price' ? 'p.price_text' : 'p.sort';
    const where: string[] = ['p.status=1'];
    const params: any[] = [];
    if (category) { const cond = categoryCond('product_categories', 'p.category_id', category, params); if (cond) where.push(cond); }
    if (keyword) { where.push(`(p.name ILIKE $${params.length + 1} OR p.series ILIKE $${params.length + 1})`); params.push(`%${escapeLike(String(keyword))}%`); }
    const w = 'WHERE ' + where.join(' AND ');
    // 单次往返：窗口函数合并总数与分页数据
    const { rows, total } = await queryPaginated(
      `SELECT p.id,p.slug,p.name,p.series,p.cover_image,p.summary,p.price_text,c.name AS category
         FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
         ${w} ORDER BY ${sort}, p.created_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });

  app.get('/public/products/:slug', async (req, reply) => {
    const { rows } = await query(`SELECT * FROM products WHERE slug=$1 AND status=1`, [(req.params as any).slug]);
    if (!rows[0]) return ok(reply, null);
    const rel = await query(
      `SELECT id,slug,name,cover_image FROM products WHERE category_id=$1 AND id<>$2 AND status=1 ORDER BY sort LIMIT 4`,
      [rows[0].category_id, rows[0].id]);
    return ok(reply, { ...rows[0], related: rel.rows });
  });

  app.get('/public/product-categories', async (_req, reply) => {
    const { rows } = await query(`SELECT * FROM product_categories ORDER BY sort`);
    return ok(reply, rows);
  });

  // 资讯列表（公开）
  app.get('/public/articles', async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const category = (req.query as any).category;
    const where = ['a.status=1', 'a.published_at IS NOT NULL', 'a.published_at<=NOW()'];
    const params: any[] = [];
    if (category) { const cond = categoryCond('article_categories', 'a.category_id', category, params); if (cond) where.push(cond); }
    const w = 'WHERE ' + where.join(' AND ');
    const { rows, total } = await queryPaginated(
      `SELECT a.id,a.slug,a.title,a.cover_image,a.summary,a.tags,a.author,a.published_at,c.name AS category
         FROM articles a LEFT JOIN article_categories c ON c.id=a.category_id
         ${w} ORDER BY a.published_at DESC`,
      params, pageSize, offset);
    return ok(reply, rows, { page, pageSize, total });
  });

  app.get('/public/articles/:slug', async (req, reply) => {
    const { rows } = await query(`SELECT * FROM articles WHERE slug=$1 AND status=1`, [(req.params as any).slug]);
    if (!rows[0]) return ok(reply, null);
    await query(`UPDATE articles SET view_count = view_count + 1 WHERE id=$1`, [rows[0].id]);
    const rel = await query(
      `SELECT id,slug,title,cover_image FROM articles WHERE category_id=$1 AND id<>$2 AND status=1 ORDER BY published_at DESC LIMIT 4`,
      [rows[0].category_id, rows[0].id]);
    return ok(reply, { ...rows[0], view_count: rows[0].view_count + 1, related: rel.rows });
  });

  app.get('/public/article-categories', async (_req, reply) => {
    const { rows } = await query(`SELECT * FROM article_categories ORDER BY sort`);
    return ok(reply, rows);
  });

  // 公开页面：仅返回已发布页的正式内容（content_json），草稿 draft_json 不外泄。
  // 装修内容要求「后台发布即时生效」，故用 no-cache + ETag 协商缓存（未变更时 304，不重复传输整份 blocks）
  app.get('/public/pages/:slug', async (req, reply) => {
    const { rows } = await query(
      `SELECT id,slug,title,meta_title,meta_description,hero_image,status,published_at,content_json,updated_at
         FROM pages WHERE slug=$1 AND status=1`, [(req.params as any).slug]);
    reply.header('cache-control', 'no-cache');
    const row = rows[0];
    if (!row) return ok(reply, null);
    const etag = `"pg${row.id}-${new Date(row.updated_at).getTime()}"`;
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return ok(reply, row);
  });

  app.get('/public/faqs', async (req, reply) => {
    const category = (req.query as any).category;
    const { rows } = await query(
      `SELECT id,question,answer,category FROM faqs WHERE status=1 ${category ? 'AND category=$1' : ''} ORDER BY category, sort`,
      category ? [category] : []);
    return ok(reply, rows);
  });

  // 全站搜索（产品 + 资讯）
  // 中文内容以 ILIKE 子串匹配为准（schema 已建 pg_trgm GIN 索引加速），保证可分词性差的中文仍可命中
  app.get('/public/search', async (req, reply) => {
    const raw = (req.query as any).q || '';
    const q = String(raw).trim();
    if (q.length < 1) return ok(reply, { products: [], articles: [] });
    if (q.length > 100) return fail(reply, 400, '搜索关键词过长', ErrCode.BAD_REQUEST);
    const like = `%${escapeLike(q)}%`;
    const products = await query(
      `SELECT id,slug,name,cover_image,summary FROM products WHERE status=1 AND (name ILIKE $1 OR series ILIKE $1) ORDER BY sort LIMIT 20`, [like]);
    const articles = await query(
      `SELECT id,slug,title,cover_image,summary FROM articles WHERE status=1 AND (title ILIKE $1 OR summary ILIKE $1) ORDER BY published_at DESC LIMIT 20`, [like]);
    return ok(reply, { products: products.rows, articles: articles.rows });
  });
}
