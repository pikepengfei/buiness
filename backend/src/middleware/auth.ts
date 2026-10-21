import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { query } from '../db.js';
import { verifyAccessToken, fail, hasPermission } from '../lib.js';
import type { AuthedUser } from '../types.js';

// 校验 Bearer Token 并装载用户信息 + 角色权限
export const authPreHandler: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(reply, 401, '未提供认证令牌');
  }
  const token = header.slice(7);
  let payload: any;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return fail(reply, 401, '令牌无效或已过期');
  }

  const { rows } = await query<{
    id: number; username: string; display_name: string;
    role_id: number; role_code: string; permissions: string[]; status: number;
  }>(
    `SELECT u.id, u.username, u.display_name, u.role_id, r.code AS role_code,
            r.permissions, u.status
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [payload.sub]
  );
  const u = rows[0];
  if (!u) return fail(reply, 401, '用户不存在');
  if (u.status !== 1) return fail(reply, 403, '账号已被禁用');

  const user: AuthedUser = {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    roleId: u.role_id,
    roleCode: u.role_code,
    permissions: u.permissions ?? [],
  };
  req.user = user;
};

// 要求特定权限点（超级管理员 * 自动通过）
export function requirePerm(permission: string): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return fail(reply, 401, '未认证');
    if (!hasPermission(req.user.permissions, permission)) {
      return fail(reply, 403, `缺少权限：${permission}`);
    }
  };
}

export function getClientInfo(req: FastifyRequest) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.toString().split(',')[0]?.trim()
    || req.socket.remoteAddress || '';
  return { ip, userAgent: req.headers['user-agent'] || '' };
}
