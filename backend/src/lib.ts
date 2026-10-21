import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sanitizeHtml from 'sanitize-html';
import { createHash } from 'crypto';
import { config } from './config.js';
import { bizCodeFromStatus } from './errors.js';

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------
export function signAccessToken(payload: object): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessTtl } as jwt.SignOptions);
}
export function signRefreshToken(payload: object): string {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshTtl } as jwt.SignOptions);
}
export function verifyAccessToken(token: string): any {
  return jwt.verify(token, config.jwt.secret);
}
export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, config.jwt.refreshSecret);
}

// ---------------------------------------------------------------------------
// 密码
// ---------------------------------------------------------------------------
// 前端只提交口令的 SHA-256 摘要（64 位小写十六进制），服务端不解密、拿不到明文；
// 入库仍对该摘要做加盐 bcrypt，避免数据库里直接存放可重放的无盐摘要
export const PASSWORD_DIGEST_HEX = /^[0-9a-f]{64}$/;

export function hashPassword(passwordDigest: string): Promise<string> {
  return bcrypt.hash(passwordDigest, config.bcryptRounds);
}
export function comparePassword(passwordDigest: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passwordDigest, hash);
}
export function sha256Hex(input: string): string {
  // 用于刷新令牌哈希（不依赖额外依赖）
  return createHash('sha256').update(input).digest('hex');
}

// 解析简易 TTL（如 '2h' / '14d' / '30m' / '45s'）为毫秒；无法解析时返回兜底值
export function parseTtl(ttl: string, fallbackMs: number): number {
  const m = /^(\d+)\s*([smhd])$/i.exec((ttl || '').trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase() as 's' | 'm' | 'h' | 'd'];
  return n * unit;
}

// ---------------------------------------------------------------------------
// XSS 清洗（富文本入库前调用）
// ---------------------------------------------------------------------------
const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'figure', 'figcaption', 'picture', 'source']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'width', 'height', 'loading', 'class'],
    a: ['href', 'target', 'rel'],
    source: ['srcset', 'type'],
  },
  allowedSchemes: ['http', 'https', 'data', 'mailto'],
};
export function sanitize(input: string): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, SANITIZE_OPTS);
}

// ---------------------------------------------------------------------------
// 统一响应 & 分页
// ---------------------------------------------------------------------------
export function ok(reply: any, data: any = null, meta?: any) {
  return reply.send({ code: 0, message: 'ok', data, ...(meta ? { meta } : {}) });
}
// code 缺省时按 HTTP 状态映射为业务错误码（见 errors.ts）
export function fail(reply: any, status: number, message: string, code = bizCodeFromStatus(status)) {
  return reply.code(status).send({ code, message, data: null });
}

export function paginate(page?: number, pageSize?: number) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

// 转义 ILIKE 通配符，避免用户输入的 % _ 被当作模式（公开与管理的模糊搜索共用）
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// JSONB 入参序列化：node-postgres 会把 JS 数组转成 PG 数组字面量（如 {a,b}），
// 那不是合法 JSON，写入 jsonb 列会报 22P02；数组/对象统一 stringify。
export function jsonb(value: any): string {
  return JSON.stringify(value === undefined ? null : value);
}

// 管理端列表通用筛选参数：关键词（模糊）/ 状态（0、1、2 精确）
export function keywordOf(raw: unknown, max = 60): string {
  const k = String(raw ?? '').trim().slice(0, max);
  return k;
}
export function statusOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
}

// ---------------------------------------------------------------------------
// RBAC 权限判定
// ---------------------------------------------------------------------------
export function hasPermission(permissions: string[] | null, required: string): boolean {
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
}
