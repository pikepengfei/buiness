/**
 * 官网区块化内容（低代码装修）核心类型与工具
 *
 * 页面内容 = 有序区块列表：{ blocks: [{ id, type, visible, props }] }
 * - content_json：线上正式版本（官网前端渲染）
 * - draft_json：管理端草稿版本（编辑器保存，发布后覆盖正式版本）
 */

export interface Block {
  id: string;
  type: string;
  visible: boolean;
  props: Record<string, any>;
}

export interface PageContent {
  blocks: Block[];
}

/** 从任意 content_json/draft_json 安全解析出区块数组 */
export function parseBlocks(raw: any): Block[] {
  if (!raw) return [];
  const blocks = typeof raw === 'string' ? safeJson(raw) : raw;
  return Array.isArray(blocks?.blocks) ? blocks.blocks : [];
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** 生成区块实例 id（type + 随机短串） */
export function genBlockId(type: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${type}-${rand}`;
}

/** 区块操作：数组上下移 / 删除 / 插入（返回新数组，供响应式赋值） */
export function moveBlock(list: Block[], index: number, delta: number): Block[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const arr = [...list];
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
  return arr;
}

export function removeBlock(list: Block[], index: number): Block[] {
  return list.filter((_, i) => i !== index);
}

export function insertBlock(list: Block[], index: number, block: Block): Block[] {
  const arr = [...list];
  arr.splice(index, 0, block);
  return arr;
}
