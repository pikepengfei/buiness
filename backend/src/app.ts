import Fastify from 'fastify';
import { ZodError } from 'zod';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { healthCheck } from './db.js';
import { usingLocalStorage, storageLocalDir } from './storage.js';
import { ErrCode, bizCodeFromStatus, isUniqueViolation, isForeignKeyViolation } from './errors.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.frontendOrigin.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { max: config.rateLimit.max, timeWindow: config.rateLimit.windowMs });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 单文件 20MB

  // 本地存储模式：将 ./uploads 以 /uploads 路径对外提供（生产请用对象存储公共读 + CDN）
  if (usingLocalStorage) {
    const fastifyStatic = (await import('@fastify/static')).default;
    await app.register(fastifyStatic, { root: storageLocalDir, prefix: '/uploads/', decorateReply: false });
  }

  // 统一错误处理 / 404：必须在注册业务路由之前声明，否则先注册的路由仍使用 Fastify 默认错误序列化
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    if (err.validation) return reply.code(400).send({ code: ErrCode.BAD_REQUEST, message: '请求参数校验失败', data: null });
    // zod .parse() 抛出 ZodError：只回传首个问题，避免把整段校验 JSON 当作 message 暴露给前端
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = (first?.path ?? []).join('.');
      return reply.code(400).send({
        code: ErrCode.BAD_REQUEST,
        message: field ? `参数不合法：${field} ${first.message}` : '请求参数校验失败',
        data: null,
      });
    }
    // 数据库唯一约束冲突 → 友好提示（409）
    if (isUniqueViolation(err)) return reply.code(409).send({ code: ErrCode.SLUG_EXISTS, message: '记录已存在（唯一字段冲突）', data: null });
    // 外键冲突（如所选分类已被删除）→ 归为参数类错误（400），避免暴露数据库细节
    if (isForeignKeyViolation(err)) return reply.code(400).send({ code: ErrCode.RELATION_NOT_FOUND, message: '关联记录不存在，请检查所选分类等关联项', data: null });
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(status).send({ code: bizCodeFromStatus(status), message: err.message || '服务器内部错误', data: null });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ code: ErrCode.NOT_FOUND, message: `资源不存在: ${req.method} ${req.url}`, data: null });
  });

  await app.register(registerRoutes, { prefix: config.apiPrefix });

  app.get('/health', async () => ({ ok: await healthCheck(), ts: Date.now() }));

  return app;
}
