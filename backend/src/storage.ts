import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { randomUUID } from 'crypto';
import { extname, resolve, sep } from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';

const isLocal = config.storage.driver === 'local';

let s3: S3Client | null = null;
if (!isLocal) {
  s3 = new S3Client({
    region: config.storage.region,
    endpoint: config.storage.endpoint || undefined,
    forcePathStyle: !!config.storage.endpoint, // 兼容 MinIO / 部分 OSS 网关
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
  });
}

// 生成存储对象键：category/yyyyMM/uuid.ext
export function genObjectKey(filename: string, category = 'general'): string {
  const ext = extname(filename).toLowerCase().replace('.', '') || 'bin';
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${category}/${ym}/${randomUUID()}.${ext}`;
}

export function publicUrl(objectKey: string): string {
  if (isLocal) return `/uploads/${objectKey}`;
  const base = config.storage.publicBase.replace(/\/$/, '');
  return `${base}/${objectKey}`;
}

// 生成预签名 PUT URL（浏览器直传云端，避免流量经后端）
export async function presignPut(objectKey: string, contentType = 'application/octet-stream'): Promise<string> {
  if (isLocal) {
    // 本地模式不支持预签名，走服务端 multipart 上传
    return '';
  }
  const cmd = new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3!, cmd, { expiresIn: 600 });
}

export async function deleteObject(objectKey: string): Promise<void> {
  if (isLocal) return; // 本地模式保留文件，按需清理
  await s3!.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: objectKey }));
}

// 删除物理对象：S3 走 DeleteObject；本地模式在 storageLocalDir 内定位文件后删除。
// objectKey 来自数据库，仍做一次目录包含校验，防止历史脏数据造成路径穿越。
export async function removeObject(objectKey: string): Promise<void> {
  if (isLocal) {
    const abs = resolve(storageLocalDir, objectKey);
    const root = storageLocalDir.endsWith(sep) ? storageLocalDir : storageLocalDir + sep;
    if (!abs.startsWith(root)) throw new Error(`非法对象键: ${objectKey}`);
    await unlink(abs).catch((e: any) => {
      if (e?.code !== 'ENOENT') throw e;
    });
    return;
  }
  await deleteObject(objectKey);
}

// 本地存储目录（相对路径归一化为绝对路径，满足 @fastify/static 对 root 的硬性要求）
export const storageLocalDir = resolve(config.storage.localDir);
// 本地模式：预先创建目录，避免 @fastify/static 报 "root ... does not exist"
if (isLocal) {
  try { mkdirSync(storageLocalDir, { recursive: true }); }
  catch (e) { console.error('[storage] failed to mkdir local dir:', storageLocalDir, e); }
}
export const usingLocalStorage = isLocal;
