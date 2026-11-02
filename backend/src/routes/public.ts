import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { query, queryPaginated } from '../db.js';
import { ok, paginate, fail, escapeLike } from '../lib.js';
import { config } from '../config.js';
import { ErrCode } from '../errors.js';
import { getClientInfo } from '../middleware/auth.js';

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

  // 资讯类公开只读接口的协商缓存：no-cache + 响应内容指纹 ETag（沿用 /public/site 的做法）。
  // 显式设定 cache-control 后本组接口即退出上面的 max-age 钩子，「发布 / 下线 / 再发布」下一跳就能拿到新内容；
  // 内容未变时浏览器带 If-None-Match 回来，只回 304、不回传响应体。
  function negotiateCache(req: any, reply: any, payload: unknown, prefix: string): boolean {
    const etag = `"${prefix}${createHash('md5').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}"`;
    reply.header('cache-control', 'no-cache');
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) { reply.code(304).send(); return true; }
    return false;
  }

  // 为所有 /public/* 只读接口附加短缓存头，降低重复查询压力（可经 PUBLIC_CACHE_MAX_AGE 调整/禁用）
  app.addHook('onSend', async (_req, reply, payload) => {
    // 页面装修内容要求「发布即时生效」：处理器已显式设定缓存头时不再覆盖
    if (config.publicCacheMaxAge > 0 && _req.url.includes('/public') && !reply.hasHeader('cache-control')) {
      reply.header('cache-control', `public, max-age=${config.publicCacheMaxAge}, s-maxage=${config.publicCacheMaxAge}, stale-while-revalidate=30`);
    }
    return payload;
  });

  // 站点全局配置 + 导航（顶栏/页脚/CTA）+ 品牌色
  app.get('/public/site', async (req, reply) => {
    const { rows: settings } = await query(`SELECT key,value,group_name,label FROM site_settings`);
    const grouped: Record<string, any> = {};
    for (const r of settings) (grouped[r.group_name] ??= {})[r.key] = r.value;
    const { rows: menus } = await query(`SELECT * FROM menus WHERE status=1 ORDER BY parent_id NULLS FIRST, sort, id`);
    const treeOf = (location: string) => {
      const rows = menus.filter((m: any) => m.location === location);
      const map = new Map<any, any>();
      const tree: any[] = [];
      rows.forEach((m: any) => map.set(m.id, { ...m, children: [] }));
      rows.forEach((m: any) => {
        const node = map.get(m.id);
        if (m.parent_id && map.has(m.parent_id)) map.get(m.parent_id).children.push(node);
        else tree.push(node);
      });
      return tree;
    };
    const data = {
      settings: grouped,
      menus: treeOf('header'),
      footerMenus: treeOf('footer'),
      ctaMenu: menus.find((m: any) => m.location === 'cta') || null,
    };
    // 导航与站点设置要求「后台改完官网即见」，不能进 max-age 缓存；
    // no-cache + 内容指纹保留 304 复用：未变更时不回传响应体
    const etag = `"site${createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 16)}"`;
    reply.header('cache-control', 'no-cache');
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return ok(reply, data);
  });

  app.get('/public/banners', async (req, reply) => {
    const position = (req.query as any).position || 'home';
    const { rows } = await query(
      `SELECT id,title,image_url,link_url,position FROM banners
        WHERE status=1 AND position=$1 AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW())
        ORDER BY sort`, [position]);
    return ok(reply, rows);
  });

  // 产品列表（公开）：只读线上表，未上架的产品（草稿 / 已下架）在公开接口里一律不存在
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
    const meta = { page, pageSize, total };
    // 上架/下架要下一跳即在官网生效，故与资讯同口径走协商缓存（详见 negotiateCache 注释）
    if (negotiateCache(req, reply, { rows, meta }, 'prod-list')) return;
    return ok(reply, rows, meta);
  });

  // 产品详情（公开）：显式列出下发列，运营侧字段（created_by / updated_by / sort / status）不出网；
  // 分类名与列表接口同形（c.name AS category），无分类时为 null，前端不再回落写死文案
  app.get('/public/products/:slug', async (req, reply) => {
    const { rows } = await query(
      `SELECT p.id,p.slug,p.name,p.series,p.cover_image,p.gallery,p.summary,p.description,
              p.specs,p.highlights,p.price_text,p.buy_link,p.published_at,p.updated_at,c.name AS category
         FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
        WHERE p.slug=$1 AND p.status=1`, [(req.params as any).slug]);
    if (!rows[0]) {
      if (negotiateCache(req, reply, null, 'prod-one')) return;
      return ok(reply, null);
    }
    // 相关推荐与列表接口同一套字段，卡片所需的分类名逐条给出
    const rel = await query(
      `SELECT r.id,r.slug,r.name,r.series,r.cover_image,r.summary,r.price_text,c.name AS category
         FROM products r LEFT JOIN product_categories c ON c.id=r.category_id
        WHERE r.category_id=$1 AND r.id<>$2 AND r.status=1 ORDER BY r.sort LIMIT 4`,
      [rows[0].category_id, rows[0].id]);
    const data = { ...rows[0], related: rel.rows };
    if (negotiateCache(req, reply, data, 'prod-one')) return;
    return ok(reply, data);
  });

  app.get('/public/product-categories', async (req, reply) => {
    const { rows } = await query(
      `SELECT id,name,slug,description,parent_id,sort FROM product_categories ORDER BY sort`);
    if (negotiateCache(req, reply, rows, 'prod-cat')) return;
    return ok(reply, rows);
  });

  // 资讯列表（公开）：只读发布表，草稿表在任何公开接口里都不出现
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
    const meta = { page, pageSize, total };
    if (negotiateCache(req, reply, { rows, meta }, 'art-list')) return;
    return ok(reply, rows, meta);
  });

  // 资讯详情（公开）：只回读到的 view_count，计数改由 POST /public/articles/:slug/view 显式上报
  app.get('/public/articles/:slug', async (req, reply) => {
    const { rows } = await query(
      `SELECT a.*, c.name AS category
         FROM articles a LEFT JOIN article_categories c ON c.id=a.category_id
        WHERE a.slug=$1 AND a.status=1`, [(req.params as any).slug]);
    if (!rows[0]) {
      const payload = null;
      if (negotiateCache(req, reply, payload, 'art-one')) return;
      return ok(reply, payload);
    }
    const rel = await query(
      `SELECT r.id,r.slug,r.title,r.cover_image,r.summary,r.tags,r.author,r.published_at,c.name AS category
         FROM articles r LEFT JOIN article_categories c ON c.id=r.category_id
        WHERE r.category_id=$1 AND r.id<>$2 AND r.status=1 ORDER BY r.published_at DESC LIMIT 4`,
      [rows[0].category_id, rows[0].id]);
    const data = { ...rows[0], related: rel.rows };
    if (negotiateCache(req, reply, data, 'art-one')) return;
    return ok(reply, data);
  });

  // 浏览计数显式上报：按「条目 + 访客指纹 + 24 小时窗口」判重，命中不计数。
  // 访客指纹 = IP + UA 的 SHA-256 摘要，明细表只存摘要不存原始 IP/UA；非已发布状态一律不计数。
  app.post('/public/articles/:slug/view', async (req, reply) => {
    const slug = String((req.params as any).slug).slice(0, 120);
    const { rows } = await query(`SELECT id, status FROM articles WHERE slug=$1`, [slug]);
    if (!rows[0]) return ok(reply, { counted: false, reason: 'not_found' });
    if (rows[0].status !== 1) return ok(reply, { counted: false, reason: 'offline' });
    const { ip, userAgent } = getClientInfo(req);
    const visitorKey = createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 64);
    // 判重与写入合成一条语句，避免「查完再插」的窗口里同访客并发虚增。
    // 参数在 CTE 里显式定型后只出现一次，否则 PG 会对同一 $2 推断出冲突的类型。
    const ins = await query(
      `WITH k AS (SELECT $1::bigint AS article_id, $2::text AS visitor_key)
       INSERT INTO article_view_dedupe(article_id, visitor_key)
       SELECT k.article_id, k.visitor_key FROM k
        WHERE NOT EXISTS (
          SELECT 1 FROM article_view_dedupe v JOIN k
            ON v.article_id = k.article_id AND v.visitor_key = k.visitor_key
           WHERE v.seen_at > NOW() - INTERVAL '24 hours')
       RETURNING id`, [rows[0].id, visitorKey]);
    if (!ins.rows[0]) return ok(reply, { counted: false, reason: 'duplicate' });
    const upd = await query(`UPDATE articles SET view_count = view_count + 1 WHERE id=$1 RETURNING view_count`, [rows[0].id]);
    return ok(reply, { counted: true, view_count: upd.rows[0].view_count });
  });

  app.get('/public/article-categories', async (req, reply) => {
    const { rows } = await query(`SELECT * FROM article_categories ORDER BY sort`);
    if (negotiateCache(req, reply, rows, 'art-cat')) return;
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
    // 产品分支同样带分类名：搜索结果卡片是官网第二跳入口，缺 category 会让标签落回硬编码
    const products = await query(
      `SELECT p.id,p.slug,p.name,p.series,p.cover_image,p.summary,p.price_text,c.name AS category
         FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
        WHERE p.status=1 AND (p.name ILIKE $1 OR p.series ILIKE $1) ORDER BY p.sort LIMIT 20`, [like]);
    // 资讯分支同样带分类名：搜索结果是官网第二跳入口，缺 category 会让卡片分类标签落回硬编码
    const articles = await query(
      `SELECT a.id,a.slug,a.title,a.cover_image,a.summary,a.tags,a.published_at,c.name AS category
         FROM articles a LEFT JOIN article_categories c ON c.id=a.category_id
        WHERE a.status=1 AND (a.title ILIKE $1 OR a.summary ILIKE $1) ORDER BY a.published_at DESC LIMIT 20`, [like]);
    const data = { products: products.rows, articles: articles.rows };
    if (negotiateCache(req, reply, data, 'search')) return;
    return ok(reply, data);
  });
}
