import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryPaginated } from '../db.js';
import { fail, ok, paginate, escapeLike, keywordOf } from '../lib.js';
import { authPreHandler, requirePerm, getClientInfo } from '../middleware/auth.js';

const inquirySchema = z.object({
  name: z.string().min(1).max(50),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().max(120).optional().or(z.literal('')),
  needType: z.string().max(40).optional(),
  productId: z.coerce.number().optional(),
  message: z.string().max(2000).optional().or(z.literal('')),
});
const cooperationSchema = z.object({
  name: z.string().min(1).max(50),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().max(120).optional().or(z.literal('')),
  coopType: z.string().max(40).optional(),
  message: z.string().max(2000).optional().or(z.literal('')),
});
const subscriptionSchema = z.object({ email: z.string().email(), type: z.string().default('news') });
const contactSchema = z.object({
  name: z.string().min(1).max(50),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  type: z.string().max(40).optional(),
  message: z.string().min(1).max(2000),
});

// 线索通知（轻量扩展点）
// 生产环境可在此接入 SMTP / 企业微信机器人 / 站内信等，目前以结构化日志占位。
function notifyNewLead(kind: string, row: { name?: string; company?: string; message?: string }) {
  console.info('[lead] new', kind, {
    name: row.name ?? null,
    company: row.company ?? null,
    message: row.message ?? null,
  });
}

// 表白名单：所有拼入 SQL 的表名必须经此校验，杜绝注入
const LEAD_TABLES = new Set(['inquiries', 'cooperation', 'contact_messages']);
function assertLeadTable(table: string): string {
  if (!LEAD_TABLES.has(table)) throw new Error(`非法线索表名: ${table}`);
  return table;
}
// 路径参数 id 校验为正向整数
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

function makeLeadRoutes(
  prefix: string,
  table: string,
  schema: z.ZodTypeAny,
  colMap: Record<string, string>,
  searchCols: string[],
) {
  assertLeadTable(table);
  return async (app: FastifyInstance) => {
    // 公开提交：独立收紧限流做防滥用（全局默认值较高，不能依赖它）
    app.post(`/forms/${prefix}`, { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, reply) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return fail(reply, 400, '参数错误');
      const b = parsed.data as any;
      const { ip } = getClientInfo(req);
      // 仅取存在于 colMap 中的键，并映射为数据库列名（JS camelCase → DB snake_case）
      const keys = Object.keys(b)
        .filter((k) => b[k] !== undefined && b[k] !== '' && colMap[k] !== undefined);
      const cols = keys.map((k) => colMap[k]);
      const vals = keys.map((k) => b[k]);
      const sql = `INSERT INTO ${table}(${cols.join(',')}, ip, status) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}, $${cols.length + 1}, 0)`;
      await query(sql, [...vals, ip]);
      // 新线索通知（扩展点：邮件 / 企业微信 / 站内信）
      notifyNewLead(prefix, { name: b.name, company: b.company, message: b.message });
      return ok(reply, null, { message: '提交成功，我们会尽快与您联系' });
    });
    // 管理：列表（状态筛选 + 姓名/公司等字段模糊搜索）
    app.get(`/leads/${prefix}`, { preHandler: [authPreHandler, requirePerm('lead:read')] }, async (req, reply) => {
      const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
      const q = (req.query as any);
      const where: string[] = []; const params: any[] = [];
      if (q.status !== undefined && q.status !== '' && /^\d{1,2}$/.test(String(q.status))) {
        where.push(`status=$${params.length + 1}`); params.push(Number(q.status));
      }
      const kw = keywordOf(q.keyword);
      if (kw) {
        where.push(`(${searchCols.map((c) => `COALESCE(${c}::text,'') ILIKE $${params.length + 1}`).join(' OR ')})`);
        params.push(`%${escapeLike(kw)}%`);
      }
      const { rows, total } = await queryPaginated(
        `SELECT * FROM ${table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`,
        params, pageSize, offset);
      return ok(reply, rows, { page, pageSize, total });
    });
    // 管理：更新状态 / 备注
    app.patch(`/leads/${prefix}/:id`, { preHandler: [authPreHandler, requirePerm('lead:write')] }, async (req, reply) => {
      const parsedId = idParamSchema.safeParse(req.params);
      if (!parsedId.success) return fail(reply, 400, '参数错误');
      const id = parsedId.data.id;
      const b = req.body as any;
      const sets: string[] = []; const p: any[] = []; let i = 1;
      if (b.status !== undefined) { sets.push(`status=$${i++}`); p.push(b.status); }
      if (b.note !== undefined) { sets.push(`note=$${i++}`); p.push(b.note); }
      if (b.handledBy !== undefined) { sets.push(`handled_by=$${i++}`); p.push(b.handledBy); }
      if (!sets.length) return fail(reply, 400, '无更新字段');
      p.push(id);
      await query(`UPDATE ${table} SET ${sets.join(',')} WHERE id=$${i}`, p);
      return ok(reply);
    });
  };
}

export async function formRoutes(app: FastifyInstance) {
  await makeLeadRoutes('inquiry', 'inquiries', inquirySchema, {
    name: 'name', phone: 'phone', email: 'email', company: 'company',
    needType: 'need_type', productId: 'product_id', message: 'message',
  }, ['name', 'company', 'phone', 'email'])(app);
  await makeLeadRoutes('cooperation', 'cooperation', cooperationSchema, {
    name: 'name', phone: 'phone', email: 'email', company: 'company',
    coopType: 'coop_type', message: 'message',
  }, ['name', 'company', 'phone', 'email'])(app);
  await makeLeadRoutes('contact', 'contact_messages', contactSchema, {
    name: 'name', phone: 'phone', email: 'email', type: 'type', message: 'message',
  }, ['name', 'phone', 'email'])(app);

  // 订阅（公开，独立限流防刷）
  app.post('/forms/subscription', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, reply) => {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '邮箱格式错误');
    await query(
      `INSERT INTO subscriptions(email,type,status) VALUES($1,$2,1)
       ON CONFLICT (email) DO UPDATE SET status=1, type=EXCLUDED.type`,
      [parsed.data.email, parsed.data.type]);
    return ok(reply, null, { message: '订阅成功' });
  });

  // 线索看板统计
  app.get('/leads/stats', { preHandler: [authPreHandler, requirePerm('lead:read')] }, async (_req, reply) => {
    const tables = ['inquiries', 'cooperation', 'contact_messages'];
    const out: any = {};
    for (const t of tables) {
      const { rows } = await query(
        `SELECT status, COUNT(*)::int AS cnt FROM ${t} GROUP BY status`);
      out[t] = rows.reduce((a: any, r: any) => ((a[r.status] = r.cnt), a), {});
    }
    return ok(reply, out);
  });
}
