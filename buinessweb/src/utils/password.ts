/**
 * 口令传输摘要
 *
 * 核心职责：
 *   1. 在浏览器内把明文口令转成 SHA-256 摘要（64 位小写十六进制），接口只提交摘要
 *
 * 特殊说明：
 *   - 结果与后端 node crypto 的 createHash('sha256').update(pwd).digest('hex') 一致，
 *     后端不解密，只对该摘要继续加盐 bcrypt 入库
 *   - 摘要即等同于登录凭证，故接口必须走 HTTPS，否则被抓包一样可重放登录
 */
import { sha256 } from 'js-sha256';

/**
 * 计算口令摘要
 *
 * @param plain - 用户输入的明文口令，仅在本次调用内使用，不落缓存不打日志
 * @returns 64 位小写十六进制摘要
 */
export const passwordDigest = (plain: string): string => sha256(plain);
