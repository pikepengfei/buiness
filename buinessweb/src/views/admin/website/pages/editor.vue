<script setup lang="ts">
/**
 * 页面装修编辑器（核心）：三栏布局
 *   左：区块列表（新增/删除/上下移/显隐/选中）
 *   中：内容表单（按 sectionRegistry.formSchema 通用渲染 BlockForm）
 *   顶栏：保存草稿 / 发布（先存草稿再发布）/ 下线 / 页面信息 meta / 返回
 *   右：实时预览（SectionRenderer 渲染草稿 blocks，website.css 定宽缩放）
 * 数据源：GET /pages/by-slug/:slug，优先取 draft_json（有区块），否则 content_json，否则内置默认。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useAuthStore } from '@/stores/auth';
import type { Page, PageListRow } from '@/types/cms';
import {
  checkInsert,
  collectIds,
  countNodes,
  duplicateTree,
  findNode,
  insertBlock,
  insertChild,
  isTemplateUsable,
  mergeBlockProps,
  moveBlock,
  moveChild,
  nestedSaveGuardMessage,
  parseBlocks,
  removeBlock,
  removeChild,
  uniqueBlockId,
  validateTree,
  walkBlocks,
  type Block,
  type InsertTarget,
} from '@/website/blocks';
import { defaultBlocks } from '@/website/pageDefaults';
import { SECTION_REGISTRY, blockLayer, sectionLabel } from '@/website/sectionRegistry';
import type { BlockTemplate } from '@/types/cms';
import SectionRenderer from '@/website/SectionRenderer.vue';
import BlockForm from '../components/BlockForm.vue';
import ComponentLibraryPanel from '../components/ComponentLibraryPanel.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const slug = String(route.params.slug || '');

/** 公共组件库抽屉：从编辑器右侧滑出，左栏头部按钮打开 */
const libraryVisible = ref(false);

/** 预览折叠阈值：节点数超过它只渲染当前模块（D Risks） */
const PREVIEW_FOLD_ABOVE = 120;

const page = ref<Page | null>(null);
const blocks = ref<Block[]>([]);
/** 选中节点的层级下标序列，如 [6,1] = 第 7 个模块的第 2 项子内容；空数组 = 未选中 */
const selPath = ref<number[]>([]);
const dirty = ref(false);
const loading = ref(false);
const saving = ref(false);
/** 只读账号读接口失败时禁止保存，避免用空内容覆盖线上草稿（spec「只读权限下的异常表现」） */
const loadFailed = ref(false);
/** 读权限账号可浏览组件库但不得改动内容 */
const canWrite = computed(() => auth.hasPerm('content:write'));

const selected = computed<Block | null>(() => blockAt(selPath.value));

function blockAt(path: number[]): Block | null {
  let list: Block[] = blocks.value;
  let node: Block | null = null;
  for (const i of path) {
    node = list[i] ?? null;
    if (!node) return null;
    list = node.children ?? [];
  }
  return node;
}

const selectedMeta = computed(() => (selected.value ? SECTION_REGISTRY[selected.value.type] : null));
/** 未注册类型仍可列出，供运营删除（spec「遇到未注册的类型」） */
const selectedRetired = computed(() => !!selected.value && !selectedMeta.value);

/** 选中节点的父模块（顶层节点的父级是页面本身，返回 undefined） */
const selectedParent = computed<Block | undefined>(() =>
  selPath.value.length >= 2 ? blockAt(selPath.value.slice(0, -1)) ?? undefined : undefined
);

/** 模块插到页面顶层选中项之后；基础元素插到选中节点的宿主模块子内容末尾 */
const moduleTarget = computed<InsertTarget>(() => ({
  index: selPath.value.length ? selPath.value[0] + 1 : blocks.value.length,
}));
const atomTarget = computed<InsertTarget | null>(() => {
  const sel = selected.value;
  if (!sel) return null;
  const host = selectedParent.value ?? sel;
  return { parentId: host.id };
});
const libraryParentType = computed(() =>
  atomTarget.value?.parentId ? findNode(blocks.value, atomTarget.value.parentId)?.block.type : undefined
);
const libraryParentLabel = computed(() =>
  libraryParentType.value ? sectionLabel(libraryParentType.value) : undefined
);

function syncExpandedWithContent(next: Block[]) {
  const ids = new Set<string>();
  walkBlocks(next, (b) => {
    if (b.children?.length) ids.add(b.id);
  });
  expandedIds.value = ids;
}

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.pages.bySlug(slug);
    page.value = res;
    const draft = parseBlocks(res.draft_json);
    const live = parseBlocks(res.content_json);
    blocks.value = draft.length ? draft : live.length ? live : defaultBlocks(slug);
    selPath.value = blocks.value.length ? [0] : [];
    syncExpandedWithContent(blocks.value);
    // 初始化完成后清脏标记（deep watch 在赋值时已触发）
    setTimeout(() => (dirty.value = false), 0);
  } catch (e: any) {
    ElMessage.error(e?.message || '页面加载失败');
    if (!canWrite.value) {
      // 只读账号读失败时不得用内置默认内容顶上，否则会诱发空内容覆盖线上草稿
      blocks.value = [];
      loadFailed.value = true;
    } else {
      blocks.value = defaultBlocks(slug);
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);

watch(blocks, () => {
  if (canWrite.value) dirty.value = true;
}, { deep: true });

/** 左栏树形行：模块行 + 展开后的子内容行 */
interface TreeRow {
  block: Block;
  path: number[];
  depth: number;
  label: string;
  retired: boolean;
  kidCount: number;
  expandable: boolean;
  /** 可改背景的模块未设定背景时的提示（spec「划分依据不可用时回退」） */
  bandMissing: boolean;
}
const expandedIds = ref(new Set<string>());
const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const push = (list: Block[], depth: number, prefix: number[]) => {
    list.forEach((b, i) => {
      const path = [...prefix, i];
      const kids = b.children ?? [];
      rows.push({
        block: b,
        path,
        depth,
        label: sectionLabel(b.type),
        retired: !SECTION_REGISTRY[b.type],
        kidCount: kids.length,
        expandable: kids.length > 0,
        bandMissing: SECTION_REGISTRY[b.type]?.band?.source === 'themeable' && typeof b.props?.theme !== 'string',
      });
      if (kids.length && expandedIds.value.has(b.id)) push(kids, depth + 1, path);
    });
  };
  push(blocks.value, 1, []);
  return rows;
});
const nodeCount = computed(() => countNodes(blocks.value));
/** 大页面预览折叠：仅渲染选中分支，其余模块留占位提示 */
const previewBlocks = computed<Block[]>(() => {
  if (nodeCount.value <= PREVIEW_FOLD_ABOVE || selPath.value.length === 0) return blocks.value;
  const top = selPath.value[0];
  return blocks.value.map((b, i) => (i === top ? b : { ...b, children: undefined }));
});
const previewFolded = computed(() => nodeCount.value > PREVIEW_FOLD_ABOVE && selPath.value.length > 0);

const selectionCrumb = computed(() => {
  if (!selPath.value.length) return '';
  return selPath.value
    .map((i, d) => {
      const b = blockAt(selPath.value.slice(0, d + 1));
      return `${b ? sectionLabel(b.type) : '?'} · 第 ${i + 1} 项`;
    })
    .join(' / ');
});

function select(path: number[]) {
  selPath.value = path;
}
function expand(id: string) {
  if (!expandedIds.value.has(id)) {
    const next = new Set(expandedIds.value);
    next.add(id);
    expandedIds.value = next;
  }
}
function toggleExpand(b: Block) {
  const next = new Set(expandedIds.value);
  if (next.has(b.id)) next.delete(b.id);
  else next.add(b.id);
  expandedIds.value = next;
}
/** 同层换位后把选中路径跟着挪 */
function adjustSelectionAfterMove(prefix: number[], moved: number, delta: number) {
  const sel = selPath.value;
  if (sel.length !== prefix.length + 1) return;
  if (sel.slice(0, -1).join(',') !== prefix.join(',')) return;
  const last = sel[sel.length - 1];
  if (last === moved) selPath.value = [...prefix, last + delta];
  else if (last === moved + delta) selPath.value = [...prefix, last - delta];
}
function moveRow(row: TreeRow, delta: number) {
  const prefix = row.path.slice(0, -1);
  const index = row.path[row.path.length - 1];
  if (!prefix.length) {
    const next = moveBlock(blocks.value, index, delta);
    if (next === blocks.value) return;
    blocks.value = next;
  } else {
    blocks.value = moveChild(blocks.value, blockAt(prefix)?.id as string, index, delta);
  }
  adjustSelectionAfterMove(prefix, index, delta);
}
function removeRow(row: TreeRow) {
  const kidTip = row.kidCount ? `其 ${row.kidCount} 项子内容会一并删除` : '发布前官网不变';
  if (!window.confirm(`确认删除「${row.label}」？${kidTip}。`)) return;
  const prefix = row.path.slice(0, -1);
  const index = row.path[row.path.length - 1];
  if (!prefix.length) {
    blocks.value = removeBlock(blocks.value, index);
    selPath.value = blocks.value.length ? [Math.min(index, blocks.value.length - 1)] : [];
    return;
  }
  const parentId = blockAt(prefix)?.id as string;
  blocks.value = removeChild(blocks.value, parentId, index);
  const remain = blockAt(prefix)?.children?.length ?? 0;
  selPath.value = remain ? [...prefix, Math.min(index, remain - 1)] : prefix;
}
function toggleVisible(b: Block) {
  if (!canWrite.value) return;
  b.visible = !b.visible;
}

// ---- 结构树拖拽排序（decoration-editor-toolkit D1：原生 HTML5 DnD，同层同父） ----
/** 拖拽中状态：源节点 id 与其所在父序列（null = 页面顶层），drop 时校验同父 */
const dragState = ref<{ id: string; parentId: string | null } | null>(null);
/** dragover 的目标行 id（渲染插入指示） */
const dragOverId = ref<string | null>(null);

function onDragStart(row: TreeRow, e: DragEvent) {
  if (!canWrite.value) return;
  const prefix = row.path.slice(0, -1);
  const parentId = prefix.length ? blockAt(prefix)?.id ?? null : null;
  dragState.value = { id: row.block.id, parentId };
  dragOverId.value = null;
  // Firefox 必须显式 setData 才会发起拖拽；不依赖 drag image，指示用行高亮表达
  e.dataTransfer?.setData('text/plain', row.block.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(row: TreeRow, e: DragEvent) {
  if (!dragState.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dragOverId.value = row.block.id;
}
function onDragLeave(row: TreeRow) {
  if (dragOverId.value === row.block.id) dragOverId.value = null;
}
function onDrop(row: TreeRow, e: DragEvent) {
  e.preventDefault();
  const drag = dragState.value;
  dragOverId.value = null;
  dragState.value = null;
  if (!drag || !canWrite.value) return;

  const src = findNode(blocks.value, drag.id);
  if (!src) return;
  const tgtPrefix = row.path.slice(0, -1);
  const tgtParentId = tgtPrefix.length ? blockAt(tgtPrefix)?.id ?? null : null;
  // D1：跨父序列（顶层 ↔ 模块 children、A 模块 → B 模块）一律拒绝，不引入隐式结构变更
  if (drag.parentId !== tgtParentId) {
    ElMessage.warning('只能在同一父序列内拖拽调整顺序；跨父级请删除后从组件库 / 模板重新插入');
    return;
  }
  if (drag.id === row.block.id) return;
  const fromIndex = src.path[src.path.length - 1];
  const toIndex = row.path[row.path.length - 1];
  // B3：moveBlock/moveChild 是 ±1 位移语义，任意落点用「移除 + 插入」组合；
  // 向下拖时移除后目标索引需 -1（off-by-one）
  const at = fromIndex < toIndex ? toIndex - 1 : toIndex;
  if (tgtParentId == null) {
    const next = insertBlock(removeBlock(blocks.value, fromIndex), at, src.block);
    blocks.value = next;
  } else {
    const next = insertChild(removeChild(blocks.value, tgtParentId, fromIndex), tgtParentId, src.block, at);
    blocks.value = next;
  }
  // D7：结构变更后按 id 重算选中路径，避免索引错位
  const found = findNode(blocks.value, drag.id);
  if (found) selPath.value = [...found.path];
}

// ---- 多选与批量操作（decoration-editor-toolkit D7：selectedIds 只服务批量，不动 selPath） ----
const selectedIds = ref(new Set<string>());

function toggleChecked(id: string) {
  if (!canWrite.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}
const allChecked = computed(
  () => !!treeRows.value.length && treeRows.value.every((r) => selectedIds.value.has(r.block.id))
);
function toggleSelectAll() {
  if (!canWrite.value) return;
  selectedIds.value = allChecked.value
    ? new Set<string>()
    : new Set(treeRows.value.map((r) => r.block.id));
}

/** 批量删除：弹窗展示受影响数量与标题清单；取消则不改动且不清除选中态（3.5） */
async function batchRemove() {
  if (!canWrite.value || !selectedIds.value.size) return;
  const victims = treeRows.value.filter((r) => selectedIds.value.has(r.block.id));
  const names = victims.map((r) => `「${r.label}」`).join('、');
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${victims.length} 个区块？${names}（含各自子内容一并删除）。取消则不做任何改动、保留勾选状态。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  const ids = selectedIds.value;
  const strip = (list: Block[]): Block[] =>
    list
      .filter((b) => !ids.has(b.id))
      .map((b) => (b.children?.length ? { ...b, children: strip(b.children) } : b));
  blocks.value = strip(blocks.value);
  // 选中主节点被删则清空单选，批量选中态随之清空
  if (!findNode(blocks.value, selPath.value.length ? blockAt(selPath.value)?.id ?? '' : '')) selPath.value = [];
  selectedIds.value = new Set<string>();
  ElMessage.success(`已删除 ${victims.length} 个区块`);
}

/** 批量存为模板（3.6）：按「类型中文名 · 序号」自动命名，逐个入库并汇总重名跳过项 */
async function batchSaveAsTemplate() {
  if (!canWrite.value || !selectedIds.value.size) return;
  const victims = treeRows.value.filter((r) => selectedIds.value.has(r.block.id));
  const counter: Record<string, number> = {};
  let okCount = 0;
  const skipped: string[] = [];
  for (const row of victims) {
    const base = row.retired ? row.block.type : sectionLabel(row.block.type);
    counter[base] = (counter[base] ?? 0) + 1;
    const name = counter[base] > 1 ? `${base} ${counter[base]}` : base;
    try {
      await cmsAdmin.blockTemplates.create({ name, type: row.block.type, props: row.block.props });
      okCount += 1;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('已存在')) skipped.push(name);
      else {
        ElMessage.error(msg || '存为模板失败');
        return;
      }
    }
  }
  const tip = skipped.length ? `，${skipped.length} 个因重名跳过（${skipped.join('、')}）` : '';
  ElMessage.success(`已存为模板 ${okCount} 个${tip}`);
}

// ---- 同页复制（3.7）：duplicateTree 整树副本插到源之后，副本独立编辑 ----
function copyRow(row: TreeRow) {
  if (!canWrite.value) return;
  const prefix = row.path.slice(0, -1);
  const index = row.path[row.path.length - 1];
  const copy = duplicateTree(row.block, new Set(collectIds(blocks.value)));
  const target: InsertTarget = prefix.length
    ? { parentId: blockAt(prefix)?.id as string, index: index + 1 }
    : { index: index + 1 };
  const why = checkInsert(blocks.value, copy, target);
  if (why) {
    ElMessage.warning(why);
    return;
  }
  if (target.parentId) {
    blocks.value = insertChild(blocks.value, target.parentId, copy, target.index);
  } else {
    blocks.value = insertBlock(blocks.value, target.index as number, copy);
  }
  const found = findNode(blocks.value, copy.id);
  if (found) selPath.value = [...found.path];
}

// ---- 跨页复制（5.5/5.6）：服务端单事务行锁追加到目标页草稿 ----
const copyPageVisible = ref(false);
const copyPageForm = ref({ slug: '', atEnd: true, index: 1 });
const copyPageOptions = ref<PageListRow[]>([]);
const copyPageBlock = ref<Block | null>(null);

async function openCopyPage(row: TreeRow) {
  if (!canWrite.value || !page.value) return;
  if (row.depth > 1) {
    ElMessage.warning('跨页复制只支持顶层模块；子内容请随所属模块整体复制');
    return;
  }
  copyPageBlock.value = row.block;
  copyPageForm.value = { slug: '', atEnd: true, index: 1 };
  try {
    const res = await cmsAdmin.pages.list();
    // 目标页限定可写（本端点需 content:write；当前账号视角即全部有内容写权限的页面）
    copyPageOptions.value = res.list.filter((p) => p.slug !== slug);
  } catch (e: any) {
    ElMessage.error(e?.message || '页面列表加载失败');
    return;
  }
  copyPageVisible.value = true;
}

async function submitCopyPage() {
  const target = copyPageOptions.value.find((p) => p.slug === copyPageForm.value.slug);
  if (!target) {
    ElMessage.warning('请选择目标页面');
    return;
  }
  const row = treeRows.value.find((r) => r.block.id === copyPageBlock.value?.id);
  const blockIndex = row ? row.path[0] : -1;
  if (blockIndex < 0) return;
  try {
    const res = await cmsAdmin.pages.copyBlock(target.slug, {
      sourcePageId: page.value!.id,
      blockIndex,
      targetIndex: copyPageForm.value.atEnd ? undefined : Math.max(1, copyPageForm.value.index) - 1,
    });
    copyPageVisible.value = false;
    // 5.6：明确副本语义并提供跳转目标页编辑器
    try {
      await ElMessageBox.confirm(
        `${res.message}。是否跳转到「${target.title}」继续编辑？`,
        '复制成功',
        { type: 'success', confirmButtonText: '跳转过去', cancelButtonText: '留在本页' }
      );
      router.push(`/admin/pages/editor/${target.slug}`);
    } catch {
      /* 留在本页 */
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '跨页复制失败');
  }
}

// ---- 模板插入与铺默认内容（4.4 / 4.5） ----
/** 该页类型是否存在默认区块集（铺入入口仅此时显示） */
const defaultAvailable = computed(() => defaultBlocks(slug).length > 0);

/** 从模板插入：mergeBlockProps 补齐注册表新增字段后，按类型层级选插入目标（B1 双层） */
function insertFromTemplate(tpl: BlockTemplate) {
  if (!canWrite.value || !isTemplateUsable(tpl.type)) return;
  const node: Block = {
    id: uniqueBlockId(tpl.type, collectIds(blocks.value)),
    type: tpl.type,
    visible: true,
    props: mergeBlockProps(tpl.type, tpl.props),
  };
  const layer = blockLayer(tpl.type);
  if (layer === 'atom') {
    if (!atomTarget.value) {
      ElMessage.warning('请先在左侧选中一个可装载子内容的模块，再插入该模板');
      return;
    }
    insertNode(node, atomTarget.value);
  } else {
    insertNode(node, moduleTarget.value);
  }
  const before = nodeCount.value;
  if (nodeCount.value > before) {
    libraryVisible.value = false;
    ElMessage.success(`已插入模板「${tpl.name}」`);
  }
}
/** 铺入默认内容（4.5/C2）：追加到现有草稿之后；页面已有内容时强调重复风险并强二次确认 */
async function applyDefaultBlocks() {
  if (!canWrite.value) return;
  const defaults = defaultBlocks(slug);
  if (!defaults.length) return;
  const hasContent = !!blocks.value.length;
  try {
    await ElMessageBox.confirm(
      hasContent
        ? `当前草稿已有 ${blocks.value.length} 个区块，默认内容将追加在其后，可能出现同类内容重复（如两组首页横幅）。确认追加？`
        : `将铺入该页面类型的 ${defaults.length} 个默认区块，确认追加？`,
      '铺入默认内容',
      { type: 'warning', confirmButtonText: '追加', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  let next = blocks.value;
  const taken = new Set(collectIds(blocks.value));
  for (const b of defaults) {
    // 默认区块 id 是固定字面量，必须整树重生成 id 避免与现有内容撞车（G6.1）
    const copy = duplicateTree(b, taken);
    const why = checkInsert(next, copy, { index: next.length });
    if (why) {
      ElMessage.warning(`「${sectionLabel(b.type)}」未铺入：${why}`);
      continue;
    }
    next = insertBlock(next, next.length, copy);
  }
  blocks.value = next;
  syncExpandedWithContent(next);
  ElMessage.success('默认内容已追加到草稿末尾');
}

// ---- 组件库插入 ----
function insertFromLibrary(type: string, target: InsertTarget) {
  const meta = SECTION_REGISTRY[type];
  if (!meta || !canWrite.value) return;
  const node: Block = {
    id: uniqueBlockId(type, collectIds(blocks.value)),
    type,
    visible: true,
    props: JSON.parse(JSON.stringify(meta.defaultProps())),
  };
  insertNode(node, target);
}

/** 公共插入落点（组件库 / 模板共用，D11）：checkInsert 试算通过才写入并更新选中路径 */
function insertNode(node: Block, target: InsertTarget) {
  const why = checkInsert(blocks.value, node, target);
  if (why) {
    ElMessage.warning(why);
    return;
  }
  if (target.parentId) {
    blocks.value = insertChild(blocks.value, target.parentId, node, target.index);
    const host = findNode(blocks.value, target.parentId);
    if (host) {
      expand(host.block.id);
      selPath.value = [...host.path, (host.block.children?.length ?? 1) - 1];
    }
    return;
  }
  const at = target.index ?? blocks.value.length;
  blocks.value = insertBlock(blocks.value, at, node);
  selPath.value = [at];
}

/** 插入成功后关闭抽屉让右栏预览立即恢复；被拒时保持打开以便看提示与调整选中项 */
function onLibraryInsert(type: string, target: InsertTarget) {
  const before = nodeCount.value;
  insertFromLibrary(type, target);
  if (nodeCount.value > before) libraryVisible.value = false;
}

// ---- 保存 / 发布 / 下线 ----
async function saveDraft(silent = false): Promise<boolean> {
  if (!page.value) {
    ElMessage.warning('页面尚未创建成功，无法保存');
    return false;
  }
  if (loadFailed.value) {
    ElMessage.error('页面内容读取失败，为避免用空内容覆盖线上草稿，已禁止保存');
    return false;
  }
  // D5 部署护栏：渲染器版本读不懂嵌套结构时拒绝保存，避免线上出现空壳模块
  const guard = nestedSaveGuardMessage(blocks.value);
  if (guard) {
    ElMessage.error(guard);
    return false;
  }
  const errors = validateTree(blocks.value);
  if (errors.length) {
    ElMessage.error(`内容结构超限：${errors.slice(0, 3).join('；')}`);
    return false;
  }
  saving.value = true;
  try {
    await cmsAdmin.pages.saveDraft(page.value.id, { blocks: blocks.value });
    dirty.value = false;
    if (!silent) ElMessage.success('草稿已保存');
    return true;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
    return false;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('发布后草稿内容将立即覆盖官网线上版本，确认发布？', '发布确认', { type: 'warning' });
  } catch {
    return;
  }
  if (!(await saveDraft(true))) return;
  try {
    await cmsAdmin.pages.publish(page.value.id);
    page.value.status = 1;
    ElMessage.success('已发布，官网即时生效');
  } catch (e: any) {
    ElMessage.error(e?.message || '发布失败');
  }
}

// 放弃草稿：清空 draft_json 并重载，编辑器回落到官网线上版本
async function discardDraft() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('放弃草稿后未发布的修改全部丢失，编辑器将回落到官网线上版本，确认放弃？', '放弃草稿', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await cmsAdmin.pages.discardDraft(page.value.id);
    await load();
    ElMessage.success('草稿已放弃，当前显示线上版本');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function unpublish() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('下线后官网将不再展示该页面，确认下线？', '下线确认', { type: 'warning' });
    await cmsAdmin.pages.unpublish(page.value.id);
    page.value.status = 0;
    ElMessage.success('已下线');
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// ---- 页面信息（SEO meta） ----
const metaVisible = ref(false);
const metaForm = ref({ title: '', metaTitle: '', metaDescription: '', heroImage: '' });
function openMeta() {
  const p = page.value;
  metaForm.value = {
    title: p?.title || '',
    metaTitle: p?.meta_title || '',
    metaDescription: p?.meta_description || '',
    heroImage: p?.hero_image || '',
  };
  metaVisible.value = true;
}
async function saveMeta() {
  if (!page.value) return;
  try {
    await cmsAdmin.pages.updateMeta(page.value.id, {
      title: metaForm.value.title,
      metaTitle: metaForm.value.metaTitle,
      metaDescription: metaForm.value.metaDescription,
      heroImage: metaForm.value.heroImage,
    });
    page.value.title = metaForm.value.title;
    page.value.meta_title = metaForm.value.metaTitle;
    page.value.meta_description = metaForm.value.metaDescription;
    page.value.hero_image = metaForm.value.heroImage;
    metaVisible.value = false;
    ElMessage.success('页面信息已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  }
}

// ---- 预览缩放 ----
const scale = ref(0.5);
const SCALE_OPTIONS = [
  { label: '50%', value: 0.5 },
  { label: '60%', value: 0.6 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

function goBack() {
  if (dirty.value && !window.confirm('有未保存的草稿修改，确认离开？')) return;
  router.push('/admin');
}
</script>

<template>
  <div class="editor" v-loading="loading">
    <!-- 顶栏 -->
    <div class="ed-topbar">
      <div class="ed-left">
        <el-button link @click="goBack">← 返回列表</el-button>
        <span class="ed-title">{{ page?.title || slug }}</span>
        <code class="ed-slug">{{ slug }}</code>
        <el-tag :type="page?.status === 1 ? 'success' : 'info'" size="small">
          {{ page?.status === 1 ? '已发布' : '未发布' }}
        </el-tag>
        <el-tag v-if="dirty" type="warning" size="small">草稿未保存</el-tag>
      </div>
      <div class="ed-right">
        <el-select v-model="scale" size="small" style="width: 90px">
          <el-option v-for="op in SCALE_OPTIONS" :key="op.value" :label="`预览 ${op.label}`" :value="op.value" />
        </el-select>
        <el-button @click="openMeta">页面信息</el-button>
        <el-button :loading="saving" :disabled="!canWrite" @click="saveDraft()">保存草稿</el-button>
        <el-button type="primary" :loading="saving" :disabled="!canWrite" @click="publish">发布</el-button>
        <el-button type="warning" plain :disabled="page?.status !== 1 || !canWrite" @click="unpublish">下线</el-button>
        <el-button link :disabled="!canWrite" @click="discardDraft">放弃草稿</el-button>
      </div>
    </div>

    <div class="ed-body">
      <!-- 左：页面结构（组件库改由右侧抽屉打开） -->
      <div class="ed-col ed-blocks">
        <div class="ed-col-head ed-blocks-head">
          <div class="ed-head-line">
            <span class="ed-head-text">页面结构（{{ blocks.length }} 个模块）</span>
            <span class="ed-count">节点 {{ nodeCount }}</span>
          </div>
          <span class="ed-head-actions">
            <el-button class="ed-lib-open" size="small" @click="libraryVisible = true">组件库 / 模板</el-button>
            <el-button v-if="!canWrite" link size="small" type="info">只读</el-button>
            <el-button v-if="canWrite && selectedIds.size" link size="small" type="warning" @click="batchRemove">
              删 {{ selectedIds.size }}
            </el-button>
            <el-button v-if="canWrite && selectedIds.size" link size="small" @click="batchSaveAsTemplate">
              存模板 {{ selectedIds.size }}
            </el-button>
            <el-button v-if="canWrite && treeRows.length" link size="small" @click="toggleSelectAll">
              {{ allChecked ? '取消全选' : '全选' }}
            </el-button>
          </span>
        </div>
        <div class="ed-block-list">
          <div
            v-for="row in treeRows"
            :key="`${row.block.id}-${row.path.join('-')}`"
            class="ed-block-item"
            :class="{
              active: row.path.join(',') === selPath.join(','),
              hidden: !row.block.visible,
              child: row.depth > 1,
              dragover: dragOverId === row.block.id && dragState?.id !== row.block.id,
            }"
            :style="{ marginLeft: `${(row.depth - 1) * 14}px` }"
            tabindex="0"
            @click="select(row.path)"
            @keydown.enter="select(row.path)"
          >
            <el-checkbox
              v-if="canWrite"
              class="eb-check"
              size="small"
              :model-value="selectedIds.has(row.block.id)"
              @change="toggleChecked(row.block.id)"
              @click.stop
            />
            <span
              class="eb-handle"
              :class="{ disabled: !canWrite }"
              draggable="true"
              :aria-label="`拖拽调整「${row.label}」顺序（仅限同一父序列内）`"
              title="拖拽调整顺序（仅限同一父序列内）"
              @dragstart="(e) => onDragStart(row, e)"
              @dragover="(e) => onDragOver(row, e)"
              @dragleave="onDragLeave(row)"
              @drop="(e) => onDrop(row, e)"
              @dragend="dragState = null; dragOverId = null"
            >⋮⋮</span>
            <button
              v-if="row.expandable"
              class="eb-fold"
              @click.stop="toggleExpand(row.block)"
            >{{ expandedIds.has(row.block.id) ? '▾' : '▸' }}</button>
            <span v-else class="eb-fold ph">·</span>
            <span class="eb-label" :title="row.retired ? row.block.type : ''">
              {{ row.label }}
              <em v-if="row.retired" class="eb-retired">类型已下线</em>
              <em v-if="row.bandMissing" class="eb-band">背景未指定</em>
              <em v-if="row.kidCount && !expandedIds.has(row.block.id)" class="eb-kids">{{ row.kidCount }} 项子内容</em>
            </span>
            <span class="eb-ops" @click.stop>
              <el-button link size="small" :title="row.block.visible ? '点击隐藏' : '点击显示'" :disabled="!canWrite" @click="toggleVisible(row.block)">
                {{ row.block.visible ? '👁' : '◡' }}
              </el-button>
              <el-button link size="small" title="上移" :disabled="!canWrite" @click="moveRow(row, -1)">↑</el-button>
              <el-button link size="small" title="下移" :disabled="!canWrite" @click="moveRow(row, 1)">↓</el-button>
              <el-button link size="small" title="同页复制：整树副本插到源之后" :disabled="!canWrite" @click="copyRow(row)">⧉</el-button>
              <el-button
                link
                size="small"
                title="复制到其他页面草稿（顶层模块；副本，之后互不影响）"
                :disabled="!canWrite || row.depth > 1"
                @click="openCopyPage(row)"
              >⇄</el-button>
              <el-button link size="small" type="danger" title="删除" :disabled="!canWrite" @click="removeRow(row)">✕</el-button>
            </span>
          </div>
          <el-empty v-if="!blocks.length" description="页面暂无内容，点上方「组件库 / 模板」插入模块" :image-size="60" />
        </div>
      </div>

      <!-- 中：内容表单 -->
      <div class="ed-col ed-form">
        <div class="ed-col-head">
          <span>内容编辑</span>
          <span v-if="selectionCrumb" class="ed-crumb">{{ selectionCrumb }}</span>
          <span v-else-if="selected" class="ed-form-type">{{ selectedMeta?.label }}（{{ selected.type }}）</span>
        </div>
        <div class="ed-form-body">
          <el-alert
            v-if="selectedRetired"
            type="warning"
            :closable="false"
            show-icon
            title="该类型已下线"
            :description="`类型 ${selected?.type} 不在当前组件库中，无法编辑内容，建议在左侧删除该项。`"
          />
          <template v-else-if="selected && selectedMeta">
            <!-- key 保证切换节点时重建表单（初始化逻辑只在 setup 执行一次） -->
            <BlockForm :key="`${selected.id}-${selPath.join('.')}`" :schema="selectedMeta.formSchema" :model="selected.props" />
          </template>
          <el-empty v-else description="从左侧选择一个节点开始编辑" :image-size="80" />
        </div>
      </div>

      <!-- 右：实时预览 -->
      <div class="ed-col ed-preview">
        <div class="ed-col-head">
          <span>实时预览（草稿）</span>
          <span class="ed-open-group">
            <a class="ed-open" :href="`/preview/${slug}`" target="_blank">预览草稿 ↗</a>
            <a class="ed-open" :href="slug === 'home' ? '/' : `/${slug}`" target="_blank">查看线上 ↗</a>
          </span>
        </div>
        <div v-if="previewFolded" class="ed-fold-tip">
          节点数 {{ nodeCount }} 超过 {{ PREVIEW_FOLD_ABOVE }}，预览已折叠未选中模块的内容
        </div>
        <div class="ed-canvas-wrap">
          <div class="ed-canvas web-scope" :style="{ transform: `scale(${scale})` }">
            <SectionRenderer :blocks="previewBlocks" preview />
          </div>
        </div>
      </div>

      <!-- 公共组件库与模板库：右侧抽屉，只覆盖预览栏；背景三栏仍可操作 -->
      <el-drawer
        v-model="libraryVisible"
        title="组件库与模板"
        class="ed-lib-drawer"
        direction="rtl"
        size="480px"
        resizable
        :append-to-body="false"
        :modal="false"
        :modal-penetrable="true"
        :lock-scroll="false"
        :close-on-click-modal="false"
      >
        <ComponentLibraryPanel
          :blocks="blocks"
          :can-write="canWrite"
          :module-target="moduleTarget"
          :atom-target="atomTarget"
          :parent-type="libraryParentType"
          :parent-label="libraryParentLabel"
          :selected-block="selected"
          :default-available="defaultAvailable"
          @insert="onLibraryInsert"
          @insert-template="insertFromTemplate"
          @apply-defaults="applyDefaultBlocks"
        />
      </el-drawer>
    </div>

    <!-- 跨页复制弹窗：选择目标页面 + 插入位置 -->
    <el-dialog v-model="copyPageVisible" title="复制到其他页面" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标页面">
          <el-select v-model="copyPageForm.slug" placeholder="选择要复制到的页面" filterable style="width: 100%">
            <el-option
              v-for="p in copyPageOptions"
              :key="p.slug"
              :label="`${p.title}（/${p.slug}）`"
              :value="p.slug"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="插入位置">
          <el-radio-group v-model="copyPageForm.atEnd">
            <el-radio :value="true">追加到末尾</el-radio>
            <el-radio :value="false">指定序号</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!copyPageForm.atEnd" label="顶层序号">
          <el-input-number v-model="copyPageForm.index" :min="1" :step-strictly="false" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          title="复制的是副本，之后与本页互不影响；写入目标页草稿，不影响其线上版本"
        />
      </el-form>
      <template #footer>
        <el-button @click="copyPageVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCopyPage">复制</el-button>
      </template>
    </el-dialog>

    <!-- 页面信息弹窗 -->
    <el-dialog v-model="metaVisible" title="页面信息（SEO / Meta）" width="520px">
      <el-form label-width="110px">
        <el-form-item label="页面标题">
          <el-input v-model="metaForm.title" placeholder="导航与列表展示标题" />
        </el-form-item>
        <el-form-item label="SEO 标题">
          <el-input v-model="metaForm.metaTitle" placeholder="留空使用页面标题" />
        </el-form-item>
        <el-form-item label="SEO 描述">
          <el-input v-model="metaForm.metaDescription" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="分享图 URL">
          <el-input v-model="metaForm.heroImage" placeholder="og:image 等分享配图" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="metaVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMeta">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 预览需官网样式：@import 由浏览器解析、不受 scoped 影响（与 WebsiteLayout 同法） */
@import url('@/assets/website.css');

.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 640px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.ed-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
  flex-wrap: wrap;
}
.ed-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ed-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ed-title {
  font-size: 15px;
  font-weight: 600;
}
.ed-slug {
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}
.ed-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px minmax(340px, 420px) 1fr;
  min-height: 0;
  /* 组件库抽屉不 append 到 body，覆盖层以此为定位基准，只盖内容区、不遮顶栏 */
  position: relative;
}
.ed-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.ed-col + .ed-col {
  border-left: 1px solid #ebeef5;
}
.ed-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f2f5;
  background: #fcfcfd;
}
.ed-form-type {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.ed-open {
  font-weight: 400;
  font-size: 12px;
  color: var(--el-color-primary);
  text-decoration: none;
}
.ed-open-group {
  display: inline-flex;
  gap: 10px;
}
/* 左栏 */
.ed-block-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 260px 栏宽放不下「名称 + 6 个操作按钮」一行：名称占首行，操作独占次行右对齐 */
.ed-block-item {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  grid-template-areas:
    'check handle fold label'
    'ops ops ops ops';
  align-items: center;
  gap: 4px 6px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.12s;
}
.ed-block-item:hover {
  border-color: #c0c4cc;
}
.ed-block-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.ed-block-item.hidden .eb-label {
  color: #c0c4cc;
  text-decoration: line-through;
}
.eb-label {
  grid-area: label;
  min-width: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.eb-label .eb-retired,
.eb-label .eb-kids,
.eb-label .eb-band {
  font-style: normal;
  font-size: 11px;
  margin-left: 6px;
  white-space: nowrap;
}
.eb-label .eb-retired,
.eb-label .eb-band {
  color: #e6a23c;
}
.eb-label .eb-kids {
  color: #a8abb2;
}
.eb-fold {
  grid-area: fold;
  width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #909399;
  font-size: 11px;
  cursor: pointer;
}
.eb-fold.ph {
  cursor: default;
  color: #dcdfe6;
}
/* 拖拽把手（decoration-editor-toolkit D1）：行级 HTML5 DnD 的发起元素；只读禁用 */
.eb-handle {
  grid-area: handle;
  padding: 0 4px;
  color: #dcdfe6;
  font-size: 11px;
  line-height: 16px;
  cursor: grab;
  user-select: none;
}
.eb-handle:hover {
  color: #909399;
}
.eb-handle.disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
/* drop 目标行：插入位置指示（不依赖 drag image） */
.ed-block-item.dragover {
  outline: 2px dashed #409eff;
  outline-offset: -2px;
  background: #ecf5ff;
}
.eb-check {
  grid-area: check;
  height: auto;
}
.ed-block-item.child {
  border-style: dashed;
  background: #fcfdff;
}
.ed-count {
  flex: none;
  font-weight: 400;
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}
.ed-crumb {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-fold-tip {
  flex: none;
  padding: 6px 14px;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  border-bottom: 1px solid #faecd8;
}
/* 左栏头部：标题行与动作行分开，批量动作出现时换行而不是把标题挤成竖排 */
.ed-blocks-head {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.ed-head-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ed-head-text {
  white-space: nowrap;
}
.ed-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ed-head-actions .el-button + .el-button {
  margin-left: 0;
}
/* 左栏组件库已改为右侧抽屉，结构树独占左栏全高 */
.eb-ops {
  grid-area: ops;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
/* link 按钮默认仍带左右内边距，6 个合计 281px 会撑破 260px 左栏；
   26px 见方是为了第 4 层（缩进 42px）仍放得下整排 6 个按钮。
   restcss.css 的 #app .el-button 是 ID 选择器，padding 只能靠 !important 压过 */
.eb-ops .el-button {
  width: 26px;
  height: 24px;
  padding: 0 !important;
  border-radius: 4px;
}
.eb-ops .el-button + .el-button {
  margin-left: 0;
}
.eb-ops .el-button:not(.is-disabled):hover {
  background: var(--el-color-primary-light-9);
}
/* 中栏 */
.ed-form-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
/* 右栏预览：定宽 1280 画布 + transform 缩放 */
.ed-canvas-wrap {
  flex: 1;
  overflow: auto;
  background: #eef1f5;
  padding: 16px;
}
.ed-canvas {
  width: 1280px;
  transform-origin: top left;
  background: #fff;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
}
</style>

<style>
/* 抽屉覆盖层改为相对 .ed-body 定位：只盖内容区右侧，顶栏保存/发布/下线不被遮挡。
   modal=false + modal-penetrable 由 Element Plus 提供 is-penetrable，背景三栏仍可点击。 */
.ed-body > .el-overlay {
  position: absolute;
}
.ed-body .el-drawer.ed-lib-drawer {
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
}
.ed-body .el-drawer.ed-lib-drawer .el-drawer__body {
  padding: 12px;
  overflow: auto;
}
</style>
