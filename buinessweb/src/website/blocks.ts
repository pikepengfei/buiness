/**
 * 官网区块化内容（低代码装修）核心类型与工具
 *
 * 页面内容 = 有序区块树：{ blocks: [{ id, type, visible, props, children? }] }
 * - content_json：线上正式版本（官网前端渲染）
 * - draft_json：管理端草稿版本（编辑器保存，发布后覆盖正式版本）
 *
 * 结构版本 2 起，模块（layer=module）可装载子内容（layer=atom）写进 children；
 * 缺省（无该字段）表示「无子内容」，模块自身内容照常渲染。
 */

import { SECTION_REGISTRY } from './sectionRegistry';

export interface Block {
  id: string;
  type: string;
  visible: boolean;
  props: Record<string, any>;
  /** 子内容序列；缺省 = 无子内容（改造前的历史数据即无此字段） */
  children?: Block[];
}

/**
 * 模板 props 兼容合并（decoration-editor-toolkit D5）：以该类型注册表 defaultProps() 为底，
 * 模板字段覆盖其上；list/object 整体覆盖（不做元素级 diff）。注册表演进后，历史模板缺的
 * 新字段由默认值补齐，表单与渲染不报错；type 不在注册表时返回空对象（调用方标不可用）。
 */
export function mergeBlockProps(type: string, props: Record<string, any> | null | undefined): Record<string, any> {
  const meta = SECTION_REGISTRY[type];
  if (!meta) return {};
  const base = JSON.parse(JSON.stringify(meta.defaultProps())) as Record<string, any>;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return base;
  // list/lines 类（数组）与 object 类整体覆盖：模板里存的是当时完整的一份数组/对象
  return { ...base, ...props };
}

/**
 * 模板可用性判定：类型在注册表中即视为可用（模块与基础元素双层均可存模板——
 * spec「任意区块可存模板」；atom 模板插入走 atomTarget（模块 children），模块模板走 moduleTarget（顶层））。
 */
export function isTemplateUsable(type: string): boolean {
  return !!SECTION_REGISTRY[type];
}

export interface PageContent {
  blocks: Block[];
}

/**
 * 区块结构版本化（落地建议 P3：向前兼容迁移）
 * - CURRENT_BLOCK_SCHEMA_VERSION：当前区块结构版本（区块 props / 字段约定演进时 +1）
 * - MIGRATIONS[v]：把「第 v 版区块」升级到「第 v+1 版」的纯函数，索引即 fromVersion
 * - parseBlocks 在每次读取（编辑器 / 官网显示 / 公开接口）时都跑迁移，保证老页面不重存也能渲染
 *   这是「向后兼容读取」的核心安全网；数据库 schema_version 列（迁移 005）用于可查询「哪些页待升级」。
 * - RENDERER_SUPPORTED_SCHEMA_VERSION：渲染器能读懂的最高结构版本，编辑器据此把关（D5 部署护栏）
 */
export const CURRENT_BLOCK_SCHEMA_VERSION = 2;
export const RENDERER_SUPPORTED_SCHEMA_VERSION = CURRENT_BLOCK_SCHEMA_VERSION;

/**
 * 嵌套上限（D6）：深度 / 单页节点总数 / 单模块子内容数
 * 与 backend/src/routes/content.ts 的 blocksSchema 递归校验保持一致，任一侧调整需同步。
 */
export const BLOCK_LIMITS = { maxDepth: 4, maxNodes: 400, maxChildren: 50 } as const;

// v0 -> v1：结构化兜底，兼容历史/部分区块
//   · visible 必须为布尔；props 必须为对象（缺省为空对象）
//   · 顺手剔除区块内部可能携带的 schemaVersion 标记，避免污染存储
const MIGRATIONS: Array<(b: Block) => Block> = [
  (b) => ({
    ...b,
    visible: typeof b.visible === 'boolean' ? b.visible : true,
    props: b.props && typeof b.props === 'object' && !Array.isArray(b.props) ? b.props : {},
  }),
  // v1 -> v2：children 归一——非数组或空数组一律回落为「缺省」，不往存储里塞空数组
  (b) => ({ ...b, children: normalizeChildren(b.children) }),
];

function normalizeChildren(raw: unknown): Block[] | undefined {
  return Array.isArray(raw) && raw.length > 0 ? (raw as Block[]) : undefined;
}

function blockSchemaVersion(b: Block): number {
  const v = (b as any).schemaVersion;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** 把单个区块向前迁移到当前版本，并剥离内部版本标记（不含子节点，子节点由 migrateTree 递归处理） */
export function migrateBlock(b: Block): Block {
  let blk: Block = { ...b };
  let v = blockSchemaVersion(blk);
  while (v < CURRENT_BLOCK_SCHEMA_VERSION && MIGRATIONS[v]) {
    blk = MIGRATIONS[v](blk);
    v += 1;
  }
  const { schemaVersion, ...rest } = blk as any;
  return rest as Block;
}

/** 逐层迁移整棵树：先迁移父节点，再对 children 递归 */
export function migrateTree(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const migrated = migrateBlock(b);
    const kids = normalizeChildren(migrated.children);
    return kids ? { ...migrated, children: migrateTree(kids) } : { ...migrated, children: undefined };
  });
}

function normalizeNode(raw: any): Block {
  const node: Block = {
    id: String(raw?.id ?? ''),
    type: String(raw?.type ?? ''),
    visible: typeof raw?.visible === 'boolean' ? raw.visible : true,
    props: raw?.props && typeof raw.props === 'object' && !Array.isArray(raw.props) ? raw.props : {},
    children: Array.isArray(raw?.children) ? parseChildren(raw.children) : undefined,
  };
  // raw 上可能带着历史版本标记，交给迁移判定「这是第几版数据」
  if (typeof raw?.schemaVersion === 'number') (node as any).schemaVersion = raw.schemaVersion;
  return node;
}

function parseChildren(raw: any[]): Block[] {
  return (raw || []).filter((c) => c && typeof c === 'object').map(normalizeNode);
}

/** 从任意 content_json/draft_json 安全解析出区块树（逐层执行版本迁移） */
export function parseBlocks(raw: any): Block[] {
  if (!raw) return [];
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  return migrateTree(parseChildren(blocks));
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** 生成区块实例 id（type + 随机短串） */
export function genBlockId(type: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${type}-${rand}`;
}

/** 在已有 id 集合内生成不冲突的实例 id（spec：每个节点标识在页面内唯一） */
export function uniqueBlockId(type: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let id = genBlockId(type);
  while (used.has(id)) id = genBlockId(type);
  return id;
}

/** 收集树上全部节点 id */
export function collectIds(blocks: Block[]): string[] {
  const out: string[] = [];
  walkBlocks(blocks, (b) => out.push(b.id));
  return out;
}

/** 深度优先遍历（回调拿到节点与从 1 开始的层级） */
export function walkBlocks(blocks: Block[], visit: (b: Block, depth: number) => void, depth = 1): void {
  for (const b of blocks || []) {
    visit(b, depth);
    if (b.children?.length) walkBlocks(b.children, visit, depth + 1);
  }
}

/** 节点总数（含模块自身与全部后代） */
export function countNodes(blocks: Block[]): number {
  let n = 0;
  walkBlocks(blocks, () => (n += 1));
  return n;
}

/** 最大嵌套深度：顶层为 1 */
export function maxDepth(blocks: Block[]): number {
  let d = 0;
  walkBlocks(blocks, (_, depth) => (d = Math.max(d, depth)));
  return d;
}

export interface NodeLocation {
  block: Block;
  /** 自顶向下的下标序列，长度即层级；顶层节点为 [i] */
  path: number[];
}

/** 按 id 定位节点及其路径（路径用于超限提示） */
export function findNode(blocks: Block[], id: string): NodeLocation | undefined {
  let found: NodeLocation | undefined;
  const walk = (list: Block[], prefix: number[]) => {
    list.forEach((b, i) => {
      if (found) return;
      const path = [...prefix, i];
      if (b.id === id) found = { block: b, path };
      else if (b.children?.length) walk(b.children, path);
    });
  };
  walk(blocks || [], []);
  return found;
}

/** 路径的读者可读形式，如 blocks.6.children.2 */
export function formatPath(path: number[]): string {
  if (!path.length) return 'blocks';
  return path.map((idx, i) => (i === 0 ? `blocks.${idx}` : `.children.${idx}`)).join('');
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

/** 对指定节点的子序列做变换并返回新的整棵树（不可变，找不到 id 时原样返回） */
export function mapChildren(blocks: Block[], parentId: string, fn: (kids: Block[]) => Block[]): Block[] {
  return blocks.map((b) => {
    if (b.id === parentId) return { ...b, children: normalizeChildren(fn(b.children || [])) };
    if (b.children?.length) {
      const kids = mapChildren(b.children, parentId, fn);
      return { ...b, children: normalizeChildren(kids) };
    }
    return b;
  });
}

/** 把节点插入到某模块的子内容中（index 缺省追加到末尾） */
export function insertChild(blocks: Block[], parentId: string, node: Block, index?: number): Block[] {
  return mapChildren(blocks, parentId, (kids) => insertBlock(kids, index ?? kids.length, node));
}

export function removeChild(blocks: Block[], parentId: string, index: number): Block[] {
  return mapChildren(blocks, parentId, (kids) => removeBlock(kids, index));
}

export function moveChild(blocks: Block[], parentId: string, index: number, delta: number): Block[] {
  return mapChildren(blocks, parentId, (kids) => moveBlock(kids, index, delta));
}

/** 整树深拷贝并重新生成标识：复制出来的实例与源互不影响；taken 用于避开页内已有 id */
export function duplicateTree(node: Block, taken = new Set<string>()): Block {
  const id = uniqueBlockId(node.type, taken);
  taken.add(id);
  const copy: Block = { id, type: node.type, visible: node.visible, props: deepClone(node.props) };
  if (node.children?.length) copy.children = node.children.map((c) => duplicateTree(c, taken));
  return copy;
}

function deepClone<T>(value: T): T {
  return value === undefined || value === null ? ({} as T) : (JSON.parse(JSON.stringify(value)) as T);
}

/** 插入目标：省略 parentId 表示插到页面顶层 */
export interface InsertTarget {
  parentId?: string;
  index?: number;
}

/** 按目标位置真实试算插入结果（顶层 or 某模块的子内容） */
export function projectInsert(blocks: Block[], incoming: Block, target: InsertTarget = {}): Block[] {
  if (target.parentId) return insertChild(blocks, target.parentId, incoming, target.index);
  return insertBlock(blocks, target.index ?? blocks.length, incoming);
}

/** 插入前的试算：真实插入位置是否会撑破深度 / 数量上限，超限返回提示语 */
export function checkInsert(
  blocks: Block[],
  incoming: Block,
  target: InsertTarget = {},
  limits = BLOCK_LIMITS
): string | undefined {
  const tree = projectInsert(blocks, incoming, target);
  const depth = maxDepth(tree);
  if (depth > limits.maxDepth) return `嵌套深度已达上限 ${limits.maxDepth} 层（插入后为 ${depth} 层）`;
  const nodes = countNodes(tree);
  if (nodes > limits.maxNodes) return `单页节点数已达上限 ${limits.maxNodes} 个（插入后为 ${nodes} 个）`;
  if (target.parentId) {
    const parent = findNode(tree, target.parentId);
    const kids = parent?.block.children?.length || 0;
    if (kids > limits.maxChildren) return `该模块子内容已达上限 ${limits.maxChildren} 项（插入后为 ${kids} 项）`;
  }
  return undefined;
}

/** 结构自检：返回「位置 → 原因」列表，供编辑器与保存前拦截共用 */
export function validateTree(blocks: Block[], limits = BLOCK_LIMITS): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const walk = (list: Block[], path: number[], depth: number) => {
    list.forEach((b, i) => {
      const at = [...path, i];
      if (depth > limits.maxDepth) errors.push(`${formatPath(at)}：嵌套深度超过 ${limits.maxDepth} 层`);
      if (seen.has(b.id)) errors.push(`${formatPath(at)}：节点标识重复（${b.id}）`);
      seen.add(b.id);
      const kids = b.children?.length || 0;
      if (kids > limits.maxChildren) errors.push(`${formatPath(at)}：子内容超过 ${limits.maxChildren} 项`);
      if (kids) walk(b.children as Block[], at, depth + 1);
    });
  };
  walk(blocks || [], [], 1);
  const total = countNodes(blocks || []);
  if (total > limits.maxNodes) errors.push(`单页节点数 ${total} 超过上限 ${limits.maxNodes}`);
  return errors;
}

/**
 * 超限裁剪：按深度、单模块子内容数、单页节点总数依次裁剪，返回新树与被裁掉的位置
 * 读取路径不做裁剪（改造前数据一律照常渲染），仅用于异常数据兜底。
 */
export function trimByLimits(
  blocks: Block[],
  limits = BLOCK_LIMITS
): { blocks: Block[]; removed: string[] } {
  const removed: string[] = [];
  const walk = (list: Block[], path: number[], depth: number): Block[] =>
    list.map((b, i) => {
      const at = [...path, i];
      const node: Block = { ...b };
      if (!node.children?.length) return node;
      if (depth >= limits.maxDepth) {
        removed.push(`${formatPath(at)}：嵌套超过 ${limits.maxDepth} 层的子内容已丢弃`);
        delete node.children;
        return node;
      }
      let kids = walk(node.children, at, depth + 1);
      if (kids.length > limits.maxChildren) {
        removed.push(`${formatPath(at)}：子内容超出 ${limits.maxChildren} 项的部分已丢弃`);
        kids = kids.slice(0, limits.maxChildren);
      }
      node.children = normalizeChildren(kids);
      return node;
    });
  let tree = walk(blocks || [], [], 1);
  const nodes = countNodes(tree);
  if (nodes > limits.maxNodes) {
    removed.push(`单页节点数 ${nodes} 超过上限 ${limits.maxNodes}，尾部模块已丢弃`);
    const kept: Block[] = [];
    for (const b of tree) {
      if (countNodes([...kept, b]) > limits.maxNodes) break;
      kept.push(b);
    }
    tree = kept;
  }
  return { blocks: tree, removed };
}

/** 树中任意层级是否存在带子内容的节点 */
export function hasNestedChildren(blocks: Block[]): boolean {
  let found = false;
  walkBlocks(blocks, (b) => {
    if (b.children?.length) found = true;
  });
  return found;
}

/**
 * 保存前护栏（D5）：渲染器读不懂嵌套结构时，禁止把带 children 的内容写进库
 * 否则 v2 树会被旧渲染器忽略 children，模块在官网上渲染成空壳。
 * 返回 undefined 表示允许保存，返回文案表示拒绝原因。
 */
export function nestedSaveGuardMessage(
  blocks: Block[],
  rendererVersion = RENDERER_SUPPORTED_SCHEMA_VERSION
): string | undefined {
  if (rendererVersion >= 2) return undefined;
  if (!hasNestedChildren(blocks)) return undefined;
  return `当前渲染器只支持到结构版本 ${rendererVersion}，模块内的子内容无法显示。请先部署支持嵌套结构的渲染器，再保存这份内容。`;
}

/** 只看模块自身文案是否有可渲染内容（不含子内容），供渲染器判断「空壳模块」 */
export function hasOwnContent(b: Block): boolean {
  return hasVisibleContent(b?.props);
}

function hasVisibleContent(value: any): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasVisibleContent);
  if (typeof value === 'object') return Object.values(value).some(hasVisibleContent);
  return false;
}
