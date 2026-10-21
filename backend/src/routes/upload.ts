import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { query } from '../db.js';
import { fail, ok } from '../lib.js';
import { authPreHandler, requirePerm, getClientInfo } from '../middleware/auth.js';
import { genObjectKey, presignPut, publicUrl, usingLocalStorage, storageLocalDir } from '../storage.js';

export async function uploadRoutes(app: FastifyInstance) {
  // 获取预签名上传地址（浏览器直传云端，推荐生产用法）
  app.post('/upload/presign', { preHandler: [authPreHandler, requirePerm('media:write')] }, async (req, reply) => {
    const b = z.object({
      filename: z.string(), contentType: z.string().default('application/octet-stream'), category: z.string().default('general'),
    }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, '参数错误');
    const objectKey = genObjectKey(b.data.filename, b.data.category);
    const uploadUrl = await presignPut(objectKey, b.data.contentType);
    return ok(reply, { objectKey, uploadUrl, url: publicUrl(objectKey), method: uploadUrl ? 'PUT' : 'POST' });
  });

  // 服务端直传（仅本地存储模式；S3 模式请使用预签名直传）
  app.post('/upload/direct', { preHandler: [authPreHandler, requirePerm('media:write')] }, async (req, reply) => {
    if (!usingLocalStorage) return fail(reply, 400, '当前为云端存储模式，请使用预签名直传');
    const data = await (req as any).file();
    if (!data) return fail(reply, 400, '未收到文件');
    const category = ((req.query as any).category as string) || 'general';
    const objectKey = genObjectKey(data.filename, category);
    const dest = join(storageLocalDir, objectKey);
    await mkdir(join(dest, '..'), { recursive: true });
    const buffer = await data.toBuffer();
    await writeFile(dest, buffer);
    const { ip } = getClientInfo(req);
    const { rows } = await query(
      `INSERT INTO media(filename,original_name,mime_type,size,bucket,object_key,url,category,created_by)
       VALUES($1,$2,$3,$4,'website',$5,$6,$7,$8) RETURNING id`,
      [objectKey.split('/').pop(), data.filename, data.mimetype, buffer.length, objectKey, publicUrl(objectKey), category, req.user!.id]);
    return ok(reply, { id: rows[0].id, url: publicUrl(objectKey), objectKey });
  });
}
