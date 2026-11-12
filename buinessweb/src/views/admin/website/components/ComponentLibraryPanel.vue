<script setup lang="ts">
/**
 * 组件库面板（常驻在编辑器右侧抽屉内）
 * 数据源是 sectionRegistry 的 layer 字段：模块层（各分组）与基础元素层（ATOM_GROUP）
 * 插入目标由编辑器算好后传入：顶层插到选中模块之后，基础元素插到选中模块的子内容里
 * 卡片缩略由 LibraryGrid/LibraryCard 用官网渲染器真实渲染（不再是 CSS 示意）
 * decoration-editor-toolkit：顶部加 el-tabs 分「组件库」（既有行为零变化）与
 * 「模板库」（BlockTemplatePanel）两个标签页，抽屉定位与三栏骨架不动
 */
import { computed, ref } from 'vue';
import type { Block, InsertTarget } from '@/website/blocks';
import { checkInsert } from '@/website/blocks';
import {
  ATOM_GROUP,
  SECTION_GROUPS,
  SECTION_REGISTRY,
  insertRejectReason,
  type SectionMeta,
} from '@/website/sectionRegistry';
import type { BlockTemplate } from '@/types/cms';
import BlockTemplatePanel from './BlockTemplatePanel.vue';
import LibraryGrid from './LibraryGrid.vue';

const props = defineProps<{
  blocks: Block[];
  canWrite: boolean;
  /** 模块项的插入目标：始终是页面顶层的某个下标 */
  moduleTarget: InsertTarget;
  /** 基础元素项的插入目标：选中模块的子内容；为 null 表示当前没有可装载的模块 */
  atomTarget: InsertTarget | null;
  /** atomTarget 对应模块的类型与名称，用于判断可否装载与提示 */
  parentType?: string;
  parentLabel?: string;
  /** 编辑器当前单选区块（模板库存为模板的内容来源；模板库标签页用） */
  selectedBlock?: Block | null;
  /** 该页类型是否存在默认区块集（模板库「铺入默认内容」入口用） */
  defaultAvailable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'insert', type: string, target: InsertTarget): void;
  (e: 'insert-template', template: BlockTemplate): void;
  (e: 'apply-defaults'): void;
}>();

const keyword = ref('');
/** 抽屉双标签页：组件库（默认）/ 模板库 */
const activeTab = ref('library');

interface LibraryItem {
  type: string;
  label: string;
  group: string;
  /** 不可插入的原因；undefined 表示可插入 */
  reason?: string;
}

function itemsFor(layer: 'module' | 'atom'): LibraryItem[] {
  const kw = keyword.value.trim().toLowerCase();
  return Object.entries(SECTION_REGISTRY)
    .filter(([, meta]) => (meta.layer ?? 'module') === layer)
    .filter(([, meta]) => (layer === 'atom' ? meta.group === ATOM_GROUP : SECTION_GROUPS.includes(meta.group)))
    .filter(([type, meta]) => !kw || `${meta.label} ${type} ${meta.group}`.toLowerCase().includes(kw))
    .map(([type, meta]) => ({ type, label: meta.label, group: meta.group, reason: rejectReason(type, meta) }))
    .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group.localeCompare(b.group)));
}

/** 依据权限、位置、上限三层判据给出不可用原因 */
function rejectReason(type: string, meta: SectionMeta): string | undefined {
  if (!props.canWrite) return '当前账号只有内容查看权限';
  const target = targetFor(meta.layer ?? 'module');
  if (!target) return '请先在左侧选中一个可装载子内容的模块';
  if (meta.layer === 'atom') {
    const why = insertRejectReason(props.parentType ?? '', 'atom');
    if (why) return why;
  }
  const probe: Block = { id: `probe-${type}`, type, visible: true, props: {} };
  return checkInsert(props.blocks, probe, target);
}

function targetFor(layer: 'module' | 'atom'): InsertTarget | null {
  return layer === 'atom' ? props.atomTarget : props.moduleTarget;
}

const moduleItems = computed(() => itemsFor('module'));
const atomItems = computed(() => itemsFor('atom'));
const segments = computed(() => [
  { title: '模块', layer: 'module' as const, items: moduleItems.value },
  { title: '基础元素', layer: 'atom' as const, items: atomItems.value },
]);
const hasResult = computed(() => moduleItems.value.length + atomItems.value.length > 0);

const targetHint = computed(() => {
  if (props.atomTarget) return `基础元素插入：「${props.parentLabel || props.atomTarget.parentId}」的子内容末尾`;
  return `模块插入：页面顶层${insertAt()}位`;
});
function insertAt(): string {
  const at = (props.moduleTarget.index ?? props.blocks.length) + 1;
  return at > props.blocks.length ? `末尾（第 ${at} 位）` : `第 ${at} 位`;
}

/** 卡片已就地拦下禁用项，这里再按清单复核一次，避免搜索/选中态切换的竞态 */
function onPick(type: string, layer: 'module' | 'atom') {
  const list = layer === 'atom' ? atomItems.value : moduleItems.value;
  const item = list.find((it) => it.type === type);
  if (!item || item.reason) return;
  const target = targetFor(layer);
  if (!target) return;
  emit('insert', type, { ...target });
}
</script>

<template>
  <div class="lib">
    <el-tabs v-model="activeTab" class="lib-tabs">
      <el-tab-pane label="组件库" name="library">
        <div class="lib-search">
          <el-input v-model="keyword" size="small" placeholder="搜索模块 / 基础元素" clearable />
        </div>
        <div class="lib-target">{{ targetHint }}</div>

        <div class="lib-body">
          <el-alert
            v-if="!canWrite"
            type="info"
            :closable="false"
            show-icon
            title="只读模式"
            description="当前账号没有内容写权限，组件库可浏览但不可插入"
          />
          <template v-for="seg in segments" :key="seg.title">
            <div class="lib-seg" v-if="seg.items.length">
              <div class="lib-seg-title">{{ seg.title }}<small>{{ seg.items.length }}</small></div>
              <LibraryGrid :items="seg.items" @pick="(type) => onPick(type, seg.layer)" />
            </div>
          </template>
          <el-empty v-if="!hasResult" description="没有匹配的组件" :image-size="52" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="模板库" name="templates" lazy>
        <BlockTemplatePanel
          :blocks="blocks"
          :can-write="canWrite"
          :module-target="moduleTarget"
          :atom-target="atomTarget"
          :parent-type="parentType"
          :selected-block="selectedBlock ?? null"
          :default-available="defaultAvailable ?? false"
          @insert-template="(tpl) => emit('insert-template', tpl)"
          @apply-defaults="emit('apply-defaults')"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.lib {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 8px;
}
/* 双标签页布局：tab 头固定，内容区撑满并各自内部滚动 */
.lib-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.lib-tabs :deep(.el-tabs__header) {
  flex: none;
  margin-bottom: 8px;
}
.lib-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.lib-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lib-search {
  flex: none;
}
.lib-target {
  flex: none;
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 5px 8px;
}
.lib-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.lib-seg {
  margin-bottom: 10px;
}
.lib-seg-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin: 4px 0 6px;
}
.lib-seg-title small {
  font-weight: 400;
  color: #a8abb2;
}
</style>
