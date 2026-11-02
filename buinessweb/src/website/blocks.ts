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

/**
 * 区块结构版本化（落地建议 P3：向前兼容迁移）
 * - CURRENT_BLOCK_SCHEMA_VERSION：当前区块结构版本（区块 props / 字段约定演进时 +1）
 * - MIGRATIONS[v]：把「第 v 版区块」升级到「第 v+1 版」的纯函数，索引即 fromVersion
 * - parseBlocks 在每次读取（编辑器 / 官网显示 / 公开接口）时都跑迁移，保证老页面不重存也能渲染
 *   这是「向后兼容读取」的核心安全网；数据库 schema_version 列（迁移 005）用于可查询「哪些页待升级」。
 */
export const CURRENT_BLOCK_SCHEMA_VERSION = 1;

// v0 -> v1：结构化兜底，兼容历史/部分区块
//   · visible 必须为布尔；props 必须为对象（缺省为空对象）
//   · 顺手剔除区块内部可能携带的 schemaVersion 标记，避免污染存储
const MIGRATIONS: Array<(b: Block) => Block> = [
  (b) => ({
    ...b,
    visible: typeof b.visible === 'boolean' ? b.visible : true,
    props: b.props && typeof b.props === 'object' && !Array.isArray(b.props) ? b.props : {},
  }),
];

function blockSchemaVersion(b: Block): number {
  const v = (b as any).schemaVersion;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** 把单个区块向前迁移到当前版本，并剥离内部版本标记 */
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

/** 从任意 content_json/draft_json 安全解析出区块数组（自动执行版本迁移） */
export function parseBlocks(raw: any): Block[] {
  if (!raw) return [];
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  return blocks.map((b: any) =>
    migrateBlock({
      id: String(b?.id ?? ''),
      type: String(b?.type ?? ''),
      visible: typeof b?.visible === 'boolean' ? b.visible : true,
      props: b?.props && typeof b.props === 'object' && !Array.isArray(b.props) ? b.props : {},
    })
  );
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
