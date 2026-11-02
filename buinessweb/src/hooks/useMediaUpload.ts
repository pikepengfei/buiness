/**
 * 素材上传 Hook
 *
 * 核心职责：
 *   1. 上传前做客户端校验（扩展名白名单 / 单文件大小 / MIME），避免无效请求打到后端
 *   2. 多文件串行上传，累计进度与逐个文件的失败原因
 *   3. 供「素材库」页与 MediaPicker 弹窗共用同一套校验口径
 *
 * 特殊说明：
 *   - IMAGE_EXTS 与 MAX_FILE_BYTES 必须与后端保持一致：白名单见
 *     `backend/src/routes/upload.ts` 的 IMAGE_EXTS，大小上限见 `backend/src/app.ts`
 *     的 @fastify/multipart limits（20MB）。后端还会用文件头签名复核，客户端校验只是前置体验。
 *   - 后端一次请求只接收一个文件（`req.file()`），批量即 N 次请求；
 *     后端全局限流 300 次/60s，故单批文件数需要设上限。
 */
import { ref } from 'vue';
import { cmsAdmin } from '@/api/cms';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 20;

export interface UploadFailure {
  name: string;
  reason: string;
}

export interface UploadResult {
  /** 上传成功后返回的图片 URL，顺序与入参一致 */
  urls: string[];
  failures: UploadFailure[];
  /** 因超出单批上限而被直接跳过的文件数 */
  skipped: number;
}

/** 校验单个文件，通过返回 null，否则返回失败原因 */
const validate = (file: File): string | null => {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) {
    return `不支持 .${ext || '未知'}，仅允许 ${IMAGE_EXTS.join('/')}`;
  }
  if (file.type && !file.type.startsWith('image/')) return '文件类型不是图片';
  if (file.size > MAX_FILE_BYTES) return `超出单文件 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限`;
  if (file.size === 0) return '文件为空';
  return null;
};

/** 后端统一响应体里的 message 才有细粒度原因（如「不是合法图片」），axios 默认 message 只有 HTTP 状态 */
const reasonOf = (e: any): string => {
  const fromBody = e?.response?.data?.message;
  return typeof fromBody === 'string' && fromBody ? fromBody : (e?.message || '上传失败');
};

export const useMediaUpload = (category = 'website') => {
  const uploading = ref(false);
  const done = ref(0);
  const total = ref(0);
  const failures = ref<UploadFailure[]>([]);

  /**
   * 串行上传一批文件，单个失败不中断后续文件
   * @param files - 待上传文件
   * @returns 成功的 URL 列表、失败明细、被跳过的文件数
   */
  const upload = async (files: File[]): Promise<UploadResult> => {
    const accepted = files.slice(0, MAX_FILES_PER_BATCH);
    const skipped = files.length - accepted.length;

    uploading.value = true;
    total.value = accepted.length;
    done.value = 0;
    failures.value = [];
    const urls: string[] = [];

    try {
      for (const file of accepted) {
        const invalid = validate(file);
        if (invalid) {
          failures.value.push({ name: file.name, reason: invalid });
        } else {
          try {
            const res = await cmsAdmin.media.uploadDirect(file, category);
            urls.push(res.url);
          } catch (e: any) {
            failures.value.push({ name: file.name, reason: reasonOf(e) });
          }
        }
        done.value += 1;
      }
    } finally {
      uploading.value = false;
    }

    return { urls, failures: failures.value, skipped };
  };

  return { uploading, done, total, failures, upload };
};
