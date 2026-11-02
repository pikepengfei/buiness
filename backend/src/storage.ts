import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { randomUUID } from 'crypto';
import { extname, resolve, sep, dirname } from 'path';
import { mkdirSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';

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
// category 会作为对象键首段直接参与本地文件路径拼接，必须先过字符白名单。
// 模式排除了「.」，从根上杜绝 ".." 之类的目录穿越；非法值静默回退 general，
// 让上传接口与预签名接口共用同一条收敛路径，不因为调用方忘了校验就漏网。
const CATEGORY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function normalizeCategory(raw: unknown, fallback = 'general'): string {
  const c = String(raw ?? '').trim().toLowerCase();
  return CATEGORY_RE.test(c) ? c : fallback;
}

export function genObjectKey(filename: string, category = 'general'): string {
  const ext = extname(filename).toLowerCase().replace('.', '') || 'bin';
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${normalizeCategory(category)}/${ym}/${randomUUID()}.${ext}`;
}

// 固定命名对象键：官网要长期引用同一张图（如品牌 Logo）时使用。
// 不带 uuid，重复上传即同名覆盖，前端引用路径稳定。
export function fixedObjectKey(category: string, name: string, ext: string): string {
  return `${normalizeCategory(category)}/${name}.${normalizeExt(ext)}`;
}

function normalizeExt(raw: string): string {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
}

// objectKey 是否仍落在本地存储目录内（写入与删除共用同一道收口校验）
export function isInsideLocalDir(objectKey: string): boolean {
  const abs = resolve(storageLocalDir, objectKey);
  const root = storageLocalDir.endsWith(sep) ? storageLocalDir : storageLocalDir + sep;
  return abs.startsWith(root);
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

// 写入物理对象：本地模式落在 storageLocalDir 内，云端模式直接 PutObject
//（固定命名资源如品牌 Logo 由服务端落盘，两种驱动都要能写，不能只支持 local）
export async function writeObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
  if (isLocal) {
    if (!isInsideLocalDir(objectKey)) throw new Error(`非法对象键: ${objectKey}`);
    const abs = resolve(storageLocalDir, objectKey);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
    return;
  }
  await s3!.send(new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: objectKey,
    ContentType: contentType,
    Body: body,
  }));
}

export async function deleteObject(objectKey: string): Promise<void> {
  if (isLocal) return; // 本地模式保留文件，按需清理
  await s3!.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: objectKey }));
}

// 删除物理对象：S3 走 DeleteObject；本地模式在 storageLocalDir 内定位文件后删除。
// objectKey 来自数据库，仍做一次目录包含校验，防止历史脏数据造成路径穿越。
export async function removeObject(objectKey: string): Promise<void> {
  if (isLocal) {
    if (!isInsideLocalDir(objectKey)) throw new Error(`非法对象键: ${objectKey}`);
    const abs = resolve(storageLocalDir, objectKey);
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
