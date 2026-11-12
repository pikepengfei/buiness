import 'dotenv/config';
import assert from 'node:assert/strict';
import { BLOCK_LIMITS, deepSanitize, validateBlocks, type BlockNode } from '../src/blocks.js';

/**
 * 区块树校验自查（无测试运行器，用 tsx 直接跑）
 * 用法: npx tsx scripts/verify-blocks.ts
 * 覆盖：children 子树的 XSS 清洗、嵌套深度/子项数上限、非法子节点的拒绝与路径消息。
 */

function leafTexts(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => leafTexts(v, out));
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((v) => leafTexts(v, out));
  return out;
}

// 1) deepSanitize 递归覆盖 children 内的富文本叶子
const hostile: BlockNode = {
  id: 'root',
  type: 'section',
  visible: true,
  props: { title: '<img src=x onerror=alert(1)>外层' },
  children: [
    { id: 'c1', type: 'text', visible: true, props: { html: '<script>alert(2)</script>中间层' },
      children: [{ id: 'c2', type: 'text', visible: true, props: { html: '<p onmouseover=alert(3)>内层</p>' } }] },
    { id: 'c3', type: 'image', visible: true, props: { src: '/website/a.webp' } },
  ],
};
const cleaned = deepSanitize({ blocks: [hostile] });
const leaves = leafTexts(cleaned);
assert.ok(!leaves.some((s) => s.includes('<script') || s.includes('onerror') || s.includes('onmouseover')),
  'children 子树中的危险标签/事件属性未被清洗');
assert.ok(leaves.some((s) => s.includes('内层')), '内层文本在清洗后被丢弃');
assert.equal(cleaned.blocks[0].children[1].props.src, '/website/a.webp', '非字符串叶子被误改');

// 2) 正常树通过校验，且 children 结构被保留
const ok = validateBlocks({ blocks: [hostile] });
assert.equal(ok.ok, true, `正常嵌套树被拒绝：${ok.ok === false ? ok.msg : ''}`);
if (ok.ok) assert.equal(ok.data.blocks[0].children?.length, 2, 'children 未在解析结果中保留');

// 3) 超过 maxDepth 的树被拒绝，消息带位置
function deepTree(depth: number): BlockNode {
  const node: BlockNode = { id: `n${depth}`, type: 'text', visible: true, props: {} };
  return depth === 1 ? node : { id: `n${depth}`, type: 'section', visible: true, props: {}, children: [deepTree(depth - 1)] };
}
const tooDeep = validateBlocks({ blocks: [deepTree(BLOCK_LIMITS.maxDepth + 2)] });
assert.equal(tooDeep.ok, false, '超深嵌套未被拒绝');
assert.match((tooDeep as any).msg, /blocks\.0.*嵌套深度超过/, '超深拒绝消息缺少路径或原因');

// 4) 单模块子内容超过 maxChildren 的树被拒绝
const manyKids = Array.from({ length: BLOCK_LIMITS.maxChildren + 1 }, (_, i) => ({
  id: `k${i}`, type: 'text', visible: true, props: {},
}));
const tooMany = validateBlocks({ blocks: [{ id: 'p', type: 'section', visible: true, props: {}, children: manyKids }] });
assert.equal(tooMany.ok, false, '超量子内容未被拒绝');

// 5) 非法子节点（缺 type / children 不是数组）被 zod 拒绝，消息带路径
const badType = validateBlocks({ blocks: [{ id: 'p', type: 'section', visible: true, props: {}, children: [{ id: 'q' }] }] });
assert.equal(badType.ok, false, '缺 type 的子节点未被拒绝');
assert.match((badType as any).msg, /blocks\.0\.children\.0/, '非法子节点消息未指向子节点路径');
const badChildren = validateBlocks({ blocks: [{ id: 'p', type: 'section', visible: true, props: {}, children: 'oops' }] });
assert.equal(badChildren.ok, false, 'children 非数组未被拒绝');

console.log('verify-blocks: 5 组断言全部通过');
