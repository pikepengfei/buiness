import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, transaction } from '../db.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  comparePassword, hashPassword, sha256Hex, PASSWORD_DIGEST_HEX, fail, ok, parseTtl,
} from '../lib.js';
import { authPreHandler, getClientInfo } from '../middleware/auth.js';
import { config } from '../config.js';
import { ErrCode } from '../errors.js';

// 刷新会话有效期（毫秒），由 JWT_REFRESH_TOKEN_TTL 驱动，默认 14 天
const refreshTtlMs = parseTtl(config.jwt.refreshTtl, 14 * 24 * 3600 * 1000);

const loginSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().regex(PASSWORD_DIGEST_HEX, '密码需为前端 SHA-256 摘要'),
});
const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export async function authRoutes(app: FastifyInstance) {
  // 登录：收紧限流防暴力破解（覆盖全局默认值）
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: 60_000 } } }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    const { username, password } = parsed.data;
    const { rows } = await query<{
      id: number; username: string; password_hash: string; display_name: string;
      role_id: number; role_code: string; permissions: string[]; status: number;
    }>(
      `SELECT u.id, u.username, u.password_hash, u.display_name, u.role_id,
              r.code AS role_code, r.permissions, u.status
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.username = $1`,
      [username]
    );
    const user = rows[0];
    const { ip, userAgent } = getClientInfo(req);

    if (!user || !(await comparePassword(password, user.password_hash))) {
      if (user) {
        await query(
          `INSERT INTO login_logs(user_id, ip, user_agent, success, reason)
           VALUES($1,$2,$3,false,'密码错误')`,
          [user.id, ip, userAgent]
        );
      }
      return fail(reply, 401, '用户名或密码错误');
    }
    if (user.status !== 1) {
      await query(`INSERT INTO login_logs(user_id,ip,user_agent,success,reason) VALUES($1,$2,$3,false,'账号禁用')`,
        [user.id, ip, userAgent]);
      return fail(reply, 403, '账号已被禁用');
    }

    const accessToken = signAccessToken({ sub: user.id });
    const refreshToken = signRefreshToken({ sub: user.id });
    const refreshHash = sha256Hex(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    await query(
      `INSERT INTO user_sessions(user_id, refresh_token_hash, expires_at, ip, user_agent)
       VALUES($1,$2,$3,$4,$5)`,
      [user.id, refreshHash, expiresAt, ip, userAgent]
    );
    await query(`UPDATE users SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`, [ip, user.id]);
    await query(`INSERT INTO login_logs(user_id,ip,user_agent,success,reason) VALUES($1,$2,$3,true,'成功')`,
      [user.id, ip, userAgent]);

    return ok(reply, {
      accessToken,
      refreshToken,
      user: {
        id: user.id, username: user.username, displayName: user.display_name,
        roleId: user.role_id, roleCode: user.role_code, permissions: user.permissions ?? [],
      },
    });
  });

  // 刷新令牌（旋转：旧令牌一次性使用，刷新时签发全新 access+refresh 并吊销旧会话）
  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    try { verifyRefreshToken(parsed.data.refreshToken); }
    catch { return fail(reply, 401, '刷新令牌无效', ErrCode.TOKEN_EXPIRED); }
    const oldHash = sha256Hex(parsed.data.refreshToken);
    const { rows } = await query<{ user_id: number }>(
      `SELECT user_id FROM user_sessions WHERE refresh_token_hash=$1 AND expires_at > NOW()`, [oldHash]);
    if (!rows[0]) return fail(reply, 401, '会话已失效，请重新登录', ErrCode.SESSION_INVALID);
    const userId = rows[0].user_id;

    // 签发新对，并在同一事务内旧会话删除 + 新会话写入（避免旋转中途失败导致令牌丢失）
    const accessToken = signAccessToken({ sub: userId });
    const refreshToken = signRefreshToken({ sub: userId });
    const newHash = sha256Hex(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    const { ip, userAgent } = getClientInfo(req);
    await transaction(async (client) => {
      await client.query(`DELETE FROM user_sessions WHERE refresh_token_hash=$1`, [oldHash]);
      await client.query(
        `INSERT INTO user_sessions(user_id, refresh_token_hash, expires_at, ip, user_agent)
         VALUES($1,$2,$3,$4,$5)`,
        [userId, newHash, expiresAt, ip, userAgent]
      );
    });
    return ok(reply, { accessToken, refreshToken });
  });

  // 退出登录（吊销刷新令牌）
  app.post('/auth/logout', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      await query(`DELETE FROM user_sessions WHERE refresh_token_hash=$1`, [sha256Hex(parsed.data.refreshToken)]);
    }
    return ok(reply);
  });

  // 当前用户信息
  app.get('/auth/me', { preHandler: authPreHandler }, async (req, reply) => {
    return ok(reply, req.user);
  });

  // 修改密码（登录用户自助）
  // 修改密码（登录用户自助）：新旧口令均为前端 SHA-256 摘要，长度策略由前端表单校验
  const changePasswordSchema = z.object({
    oldPassword: z.string().regex(PASSWORD_DIGEST_HEX, '密码需为前端 SHA-256 摘要'),
    newPassword: z.string().regex(PASSWORD_DIGEST_HEX, '密码需为前端 SHA-256 摘要'),
  });
  app.post('/auth/change-password', { preHandler: authPreHandler }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    const { oldPassword, newPassword } = parsed.data;
    const { rows } = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1`, [req.user!.id]);
    const user = rows[0];
    if (!user) return fail(reply, 401, '用户不存在');
    const matched = await comparePassword(oldPassword, user.password_hash);
    if (!matched) return fail(reply, 401, '原密码错误');
    const newHash = await hashPassword(newPassword);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, req.user!.id]);
    // 改密后吊销所有既有刷新会话，强制其他设备重新登录（安全加固）
    await query(`DELETE FROM user_sessions WHERE user_id=$1`, [req.user!.id]);
    return ok(reply);
  });

  // 更新当前用户资料（displayName / email / avatarUrl）
  const updateMeSchema = z.object({
    displayName: z.string().min(1).max(50).optional(),
    email: z.string().email().optional().or(z.literal('')),
    avatarUrl: z.string().url().optional().or(z.literal('')),
  });
  app.patch('/auth/me', { preHandler: authPreHandler }, async (req, reply) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, '参数错误');
    const b = parsed.data;
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (b.displayName !== undefined) { sets.push(`display_name=$${i++}`); params.push(b.displayName); }
    if (b.email !== undefined) { sets.push(`email=$${i++}`); params.push(b.email || null); }
    if (b.avatarUrl !== undefined) { sets.push(`avatar_url=$${i++}`); params.push(b.avatarUrl || null); }
    if (!sets.length) return fail(reply, 400, '无更新字段');
    params.push(req.user!.id);
    await query(`UPDATE users SET ${sets.join(',')} WHERE id=$${i}`, params);
    const { rows } = await query<{
      id: number; username: string; display_name: string;
      role_id: number; role_code: string; permissions: string[];
    }>(
      `SELECT u.id, u.username, u.display_name, u.role_id,
              r.code AS role_code, r.permissions
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1`,
      [req.user!.id]
    );
    const u = rows[0];
    return ok(reply, {
      id: u.id, username: u.username, displayName: u.display_name,
      roleId: u.role_id, roleCode: u.role_code, permissions: u.permissions ?? [],
    });
  });
}
