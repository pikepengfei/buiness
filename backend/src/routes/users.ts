import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryPaginated } from '../db.js';
import { hashPassword, PASSWORD_DIGEST_HEX, fail, ok, paginate, escapeLike, keywordOf } from '../lib.js';
import { authPreHandler, requirePerm, getClientInfo } from '../middleware/auth.js';

const createSchema = z.object({
  username: z.string().min(2).max(50),
  // 前端 SHA-256 摘要；口令长度与复杂度由前端表单校验
  password: z.string().regex(PASSWORD_DIGEST_HEX, '密码需为前端 SHA-256 摘要'),
  email: z.string().email().optional().or(z.literal('')),
  displayName: z.string().min(1).max(50),
  roleId: z.coerce.number().int().positive(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});
const updateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  roleId: z.coerce.number().int().positive().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
  password: z.string().regex(PASSWORD_DIGEST_HEX, '密码需为前端 SHA-256 摘要').optional(),
});

export async function userRoutes(app: FastifyInstance) {
  const admin = [authPreHandler, requirePerm('user:write')];

  app.get('/roles', { preHandler: authPreHandler }, async (_req, reply) => {
    const { rows } = await query(`SELECT id, code, name, description, permissions FROM roles ORDER BY id`);
    return ok(reply, rows);
  });

  app.get('/users', { preHandler: admin }, async (req, reply) => {
    const { page, pageSize, offset } = paginate((req.query as any).page, (req.query as any).pageSize);
    const q = (req.query as any);
    const where: string[] = []; const params: any[] = [];
    const kw = keywordOf(q.keyword);
    if (kw) {
      where.push(`(u.username ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1} OR COALESCE(u.display_name,'') ILIKE $${params.length + 1})`);
      params.push(`%${escapeLike(kw)}%`);
    }
    if (q.status !== undefined && q.status !== '' && /^\d{1,2}$/.test(String(q.status))) {
      where.push(`u.status=$${params.length + 1}`); params.push(Number(q.status));
    }
    if (q.roleId && Number(q.roleId) > 0) { where.push(`u.role_id=$${params.length + 1}`); params.push(Number(q.roleId)); }
    const { rows, total } = await queryPaginated(
      `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role_id,
              r.name AS role_name, u.status, u.last_login_at, u.created_at
         FROM users u JOIN roles r ON r.id = u.role_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY u.created_at DESC`,
      params, pageSize, offset
    );
    return ok(reply, rows, { page, pageSize, total });
  });

  app.post('/users', { preHandler: admin }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误', 400);
    const { username, password, email, displayName, roleId, avatarUrl } = parsed.data;
    const dup = await query(`SELECT 1 FROM users WHERE username=$1`, [username]);
    if (dup.rows[0]) return fail(reply, 409, '用户名已存在');
    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users(username,email,password_hash,display_name,role_id,avatar_url)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [username, email || null, hash, displayName, roleId, avatarUrl || null]
    );
    const { ip } = getClientInfo(req);
    await query(
      `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,ip) VALUES($1,'create','user',$2,$3)`,
      [req.user!.id, rows[0].id, ip]
    );
    return ok(reply, { id: rows[0].id });
  });

  app.get('/users/:id', { preHandler: admin }, async (req, reply) => {
    const { rows } = await query(
      `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role_id,
              r.name AS role_name, u.status FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`,
      [(req.params as any).id]
    );
    if (!rows[0]) return fail(reply, 404, '用户不存在');
    return ok(reply, rows[0]);
  });

  app.patch('/users/:id', { preHandler: admin }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    const id = Number((req.params as any).id);
    const cur = await query(`SELECT 1 FROM users WHERE id=$1`, [id]);
    if (!cur.rows[0]) return fail(reply, 404, '用户不存在');
    const patch: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      if (k === 'password') {
        patch.push(`password_hash=$${i++}`);
        params.push(await hashPassword(v as string));
      } else {
        const col = { displayName: 'display_name', email: 'email', roleId: 'role_id', status: 'status', avatarUrl: 'avatar_url' }[k];
        patch.push(`${col}=$${i++}`);
        params.push(v);
      }
    }
    if (patch.length === 0) return fail(reply, 400, '无更新字段');
    params.push(id);
    await query(`UPDATE users SET ${patch.join(',')} WHERE id=$${i}`, params);
    const { ip } = getClientInfo(req);
    await query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,ip) VALUES($1,'update','user',$2,$3)`,
      [req.user!.id, id, ip]);
    return ok(reply);
  });

  app.delete('/users/:id', { preHandler: admin }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (id === req.user!.id) return fail(reply, 400, '不能删除自身');
    await query(`DELETE FROM users WHERE id=$1`, [id]);
    return ok(reply);
  });
}
