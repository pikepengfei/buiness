import { describe, expect, it } from 'vitest';
import { passwordDigest } from './password';

// 期望值取自后端同款算法：node crypto createHash('sha256').update(plain).digest('hex')
const VECTORS: { label: string; plain: string; hex: string }[] = [
  { label: '空串', plain: '', hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { label: 'abc', plain: 'abc', hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  {
    label: '默认管理员口令',
    plain: 'Admin@123456',
    hex: 'ad89b64d66caa8e30e5d5ce4a9763f4ecc205814c412175f3e2c50027471426d'
  },
  {
    label: '中文口令',
    plain: '芯联创密码123',
    hex: '2ae0d2f61254046acc3f05f92d74b57b4a9d9683e16acf7be9e13452e8fc8f33'
  },
  {
    label: 'emoji 与中文混排',
    plain: '🔐密码test',
    hex: '24f5855cea7e7b475364fe9bea7b927945aa8abbed2a3d7bba50dd2130a5206b'
  },
  {
    label: '跨多分组的长口令',
    plain: 'a'.repeat(1000),
    hex: '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'
  }
];

describe('passwordDigest', () => {
  it.each(VECTORS)('$label', ({ plain, hex }) => {
    expect(passwordDigest(plain)).toBe(hex);
  });

  it('输出 64 位小写十六进制', () => {
    expect(passwordDigest('Admin@123456')).toMatch(/^[0-9a-f]{64}$/);
  });
});
