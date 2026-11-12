/**
 * 区块树校验（结构版本 2）
 *
 * 只校验骨架：{ blocks: [{ id, type, visible, props, children? }] }
 * 具体 type 与各 props 由前端 sectionRegistry 定义，后端不重复维护类型清单。
 *
 * 上限（D6）与前端 website/blocks.ts 的 BLOCK_LIMITS 保持一致，任一侧调整需同步：
 *   嵌套深度 ≤ 4 层 / 单页节点总数 ≤ 400 / 单模块子内容 ≤ 50 项
 */
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { sanitize } from './lib.js';
export const BLOCK_LIMITS = { maxDepth: 4, maxNodes: 400, maxChildren: 50, topBlocks: 200 } as const;

export interface BlockNode {
  id: string;
  type: string;
  visible: boolean;
  props: Record<string, unknown>;
  children?: BlockNode[];
}

// 入参类型放宽到 unknown：zod 的 .default() 会让「输入」比「输出」多一个 undefined，
// 若写成 z.ZodType<BlockNode> 会因输入类型不匹配而报错。
const blockNodeSchema: z.ZodType<BlockNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(40),
    visible: z.boolean().default(true),
    props: z.record(z.unknown()).default({}),
    children: z.array(blockNodeSchema).max(BLOCK_LIMITS.maxChildren).optional(),
  })
);

export const blocksSchema = z.object({
  blocks: z.array(blockNodeSchema).max(BLOCK_LIMITS.topBlocks).default([]),
});

/** 路径的可读形式，如 blocks.6.children.2 */
function formatPath(path: (string | number)[]): string {
  return path.length ? path.join('.') : 'blocks';
}

/** 结构上限复核：深度与总数无法用 zod 表达，按树遍历给出「位置 + 原因」 */
export function blockLimitIssues(blocks: BlockNode[]): string[] {
  const issues: string[] = [];
  let total = 0;
  const walk = (list: BlockNode[], path: (string | number)[], depth: number) => {
    list.forEach((b, i) => {
      const at = [...path, i];
      total += 1;
      if (depth > BLOCK_LIMITS.maxDepth) {
        issues.push(`${formatPath(at)}：嵌套深度超过 ${BLOCK_LIMITS.maxDepth} 层`);
        return;
      }
      if (b.children?.length) walk(b.children, [...at, 'children'], depth + 1);
    });
  };
  walk(blocks || [], ['blocks'], 1);
  if (total > BLOCK_LIMITS.maxNodes) {
    issues.push(`blocks：单页节点数 ${total} 超过上限 ${BLOCK_LIMITS.maxNodes}`);
  }
  return issues;
}

export type BlocksValidation = { ok: true; data: { blocks: BlockNode[] } } | { ok: false; msg: string };

export function validateBlocks(raw: unknown): BlocksValidation {
  const parsed = blocksSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const at = Array.isArray(first?.path) && first.path.length ? `（${formatPath(first.path as (string | number)[])}）` : '';
    return {
      ok: false,
      msg: `区块数据不合法${at}：需为 { blocks: [{ id, type, visible, props, children? }] }，`
        + `子内容同样按此结构，单模块子内容不超过 ${BLOCK_LIMITS.maxChildren} 项`,
    };
  }
  const issues = blockLimitIssues(parsed.data.blocks);
  if (issues.length) return { ok: false, msg: `区块数据不合法（${issues[0]}）` };
  return { ok: true, data: parsed.data };
}

/**
 * 递归清洗 content_json 中的字符串叶子（防 XSS）
 * 结构版本 2 起子内容在 children 里，同样由本函数覆盖（数组与对象递归天然覆盖整棵树）。
 */
export function deepSanitize(value: unknown): any {
  if (typeof value === 'string') return sanitize(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value && typeof value === 'object') {
    const o: Record<string, any> = {};
    for (const k of Object.keys(value)) o[k] = deepSanitize((value as Record<string, any>)[k]);
    return o;
  }
  return value;
}

// ---------------- 服务端整树复制（跨页复制用，decoration-editor-toolkit C3） ----------------
// 与前端 duplicateTree 同语义：深拷贝整树、逐节点生成页内唯一新 id（type 前缀 + 6 位随机），
// 保留 visible 与 children；副本与源互不影响。前端 uniqueBlockId 不在服务端可用，此处独立实现，
// 命名与上限口径与前端保持同步。
const ID_TAIL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomIdTail(): string {
  let tail = '';
  for (let i = 0; i < 6; i += 1) tail += ID_TAIL_ALPHABET[randomInt(ID_TAIL_ALPHABET.length)];
  return tail;
}

function newBlockId(type: string, taken: Set<string>): string {
  let id = `${type}-${randomIdTail()}`;
  while (taken.has(id)) id = `${type}-${randomIdTail()}`;
  return id;
}

/** 整树深拷贝并重新生成每个节点的 id；taken 收集页内已有 id，避免新 id 撞车 */
export function duplicateBlockTree(node: BlockNode, taken: Set<string> = new Set()): BlockNode {
  const id = newBlockId(node.type, taken);
  taken.add(id);
  const copy: BlockNode = {
    ...node,
    id,
    props: JSON.parse(JSON.stringify(node.props ?? {})) as Record<string, unknown>,
  };
  if (node.children?.length) copy.children = node.children.map((c) => duplicateBlockTree(c, taken));
  return copy;
}
