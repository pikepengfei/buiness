import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { fail, ok } from '../lib.js';
import { ErrCode } from '../errors.js';
import { authPreHandler, requirePerm } from '../middleware/auth.js';
import {
  genObjectKey, fixedObjectKey, presignPut, publicUrl, usingLocalStorage,
  normalizeCategory, writeObject, removeObject,
} from '../storage.js';

// 仅允许图片入库：上传的文件会由 @fastify/static 以同域 /uploads/ 直接吐给浏览器，
// 一旦放行 .html/.svg 这类可脚本化的类型，就等于把同域脚本执行权交给上传者。
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

const extOf = (filename: string) => (filename.split('.').pop() || '').toLowerCase();

// 扩展名与 MIME 都是客户端自报的，再用文件头做一次签名校验，
// 防止把 HTML/JS 改名成 .png 绕过白名单。
function hasImageSignature(buf: Buffer, ext: string): boolean {
  const at = (offset: number, ...bytes: number[]) =>
    buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
  switch (ext) {
    case 'png': return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpg':
    case 'jpeg': return at(0, 0xff, 0xd8, 0xff);
    case 'gif': return at(0, 0x47, 0x49, 0x46, 0x38) && (buf[5] === 0x37 || buf[5] === 0x39) && buf[6] === 0x61;
    case 'webp': return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    case 'bmp': return at(0, 0x42, 0x4d);
    case 'avif': return at(4, 0x61, 0x76, 0x69, 0x66);
    default: return false;
  }
}

interface ImageFile { buffer: Buffer; ext: string; mimetype: string; originalName: string }
type ReadImageResult = { ok: true; file: ImageFile } | { ok: false; status: number; msg: string; code: number };

// 取 multipart 中的单个文件，按「扩展名白名单 → 客户端声明的 MIME → 文件头签名」三道口径校验。
// 服务端直传与 Logo 上传共用，避免两条入口的校验规则各写一遍后走偏。
async function readImageFile(req: any): Promise<ReadImageResult> {
  const data = await req.file();
  if (!data) return { ok: false, status: 400, msg: '未收到文件', code: ErrCode.NO_FILE };
  const ext = extOf(String(data.filename || ''));
  if (!IMAGE_EXTS.includes(ext)) {
    return { ok: false, status: 400, msg: `不支持的文件类型：${ext || '未知'}，仅允许 ${IMAGE_EXTS.join('/')}`, code: ErrCode.UNSUPPORTED_MEDIA };
  }
  if (!String(data.mimetype).toLowerCase().startsWith('image/')) {
    return { ok: false, status: 400, msg: '文件声明的类型不是图片', code: ErrCode.UNSUPPORTED_MEDIA };
  }
  const buffer = await data.toBuffer();
  if (!hasImageSignature(buffer, ext)) {
    return { ok: false, status: 400, msg: '文件内容与扩展名不符，已拒绝', code: ErrCode.UNSUPPORTED_MEDIA };
  }
  return { ok: true, file: { buffer, ext, mimetype: data.mimetype, originalName: data.filename } };
}

// 官网 Logo：固定命名 brand/logo.<ext>，同名覆盖，官网前端按稳定路径引用。
// 刻意不登记 media 记录——素材库允许删记录并清除物理文件，而素材引用扫描
// 并不覆盖 site_settings，Logo 一旦进了素材库，一次误删就会让官网顶栏 404。
const LOGO_CATEGORY = 'brand';
const LOGO_NAME = 'logo';
const LOGO_SETTING_KEY = 'logo_url';
const LOGO_SETTING_LABEL = '品牌 Logo';

// 由现存 logo_url 反推上一版 Logo 的 objectKey（换扩展名时据此清理旧图）。
// 只取 brand/logo. 之后的扩展名段并回查白名单，拼回规范键名：不把整段 URL 当作路径，
// 外链、脏数据或带目录穿越的的历史值都会落到 null 被跳过；?v= 查询串先剥掉。
function logoObjectKeyOf(value: unknown): string | null {
  const raw = String(value ?? '').split('?')[0];
  const marker = `${LOGO_CATEGORY}/${LOGO_NAME}.`;
  const idx = raw.lastIndexOf(marker);
  if (idx < 0) return null;
  const ext = raw.slice(idx + marker.length).toLowerCase();
  return IMAGE_EXTS.includes(ext) ? `${marker}${ext}` : null;
}

export async function uploadRoutes(app: FastifyInstance) {
  // 获取预签名上传地址（浏览器直传云端，推荐生产用法）
  app.post('/upload/presign', { preHandler: [authPreHandler, requirePerm('media:write')] }, async (req, reply) => {
    const b = z.object({
      filename: z.string(), contentType: z.string().default('application/octet-stream'), category: z.string().default('general'),
    }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, '参数错误');
    if (!IMAGE_EXTS.includes(extOf(b.data.filename))) return fail(reply, 400, `不支持的文件类型：${extOf(b.data.filename) || '未知'}`, ErrCode.UNSUPPORTED_MEDIA);
    const objectKey = genObjectKey(b.data.filename, b.data.category);
    const uploadUrl = await presignPut(objectKey, b.data.contentType);
    return ok(reply, { objectKey, uploadUrl, url: publicUrl(objectKey), method: uploadUrl ? 'PUT' : 'POST' });
  });

  // 服务端直传（仅本地存储模式；S3 模式请使用预签名直传）
  app.post('/upload/direct', { preHandler: [authPreHandler, requirePerm('media:write')] }, async (req, reply) => {
    if (!usingLocalStorage) return fail(reply, 400, '当前为云端存储模式，请使用预签名直传', ErrCode.STORAGE_MODE_MISMATCH);
    const parsed = await readImageFile(req);
    if (!parsed.ok) return fail(reply, parsed.status, parsed.msg, parsed.code);
    const { buffer, ext, mimetype, originalName } = parsed.file;
    const category = normalizeCategory((req.query as any).category);
    // category 已在 genObjectKey 内收敛，写入前 storage 还会对最终路径兜底校验
    const objectKey = genObjectKey(`x.${ext}`, category);
    await writeObject(objectKey, buffer, mimetype);
    const { rows } = await query(
      `INSERT INTO media(filename,original_name,mime_type,size,bucket,object_key,url,category,created_by)
       VALUES($1,$2,$3,$4,'website',$5,$6,$7,$8) RETURNING id`,
      [objectKey.split('/').pop(), originalName, mimetype, buffer.length, objectKey, publicUrl(objectKey), category, req.user!.id]);
    return ok(reply, { id: rows[0].id, url: publicUrl(objectKey), objectKey });
  });

  // 官网 Logo 上传：固定命名、同名覆盖、换格式时清掉上一版，并把带版本号的 URL 写回站点设置
  app.post('/upload/logo', { preHandler: [authPreHandler, requirePerm('media:write')] }, async (req, reply) => {
    const parsed = await readImageFile(req);
    if (!parsed.ok) return fail(reply, parsed.status, parsed.msg, parsed.code);
    const { buffer, ext, mimetype } = parsed.file;
    const objectKey = fixedObjectKey(LOGO_CATEGORY, LOGO_NAME, ext);
    await writeObject(objectKey, buffer, mimetype);

    // 旧 Logo 与新 Logo 扩展名不同（png → webp）时才会留下无人引用的文件，按需清除；
    // 清除失败不阻断：设置已指向新图，旧图只是多占一处存储
    const { rows: current } = await query(`SELECT value FROM site_settings WHERE key=$1`, [LOGO_SETTING_KEY]);
    const previousKey = logoObjectKeyOf(current[0]?.value);
    if (previousKey && previousKey !== objectKey) {
      await removeObject(previousKey).catch(() => { /* 旧文件可能已被人工清理 */ });
    }

    // 对象名固定，内容变了 URL 不变 → 靠 ?v= 让浏览器/CDN 取到新图
    const url = `${publicUrl(objectKey)}?v=${Date.now()}`;
    await query(
      `INSERT INTO site_settings(key,value,group_name,label,description)
       VALUES($1,$2,'general',$3,'官网左上角 Logo，上传后固定命名为 brand/logo.<ext> 并覆盖旧图')
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, label=EXCLUDED.label, updated_at=NOW()`,
      [LOGO_SETTING_KEY, url, LOGO_SETTING_LABEL]);

    return ok(reply, { url, objectKey });
  });
}
