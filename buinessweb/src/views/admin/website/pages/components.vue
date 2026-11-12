<script setup lang="ts">
/**
 * 组件库（页面配置 → 二级页）
 * 浏览官网可用的全部模块与基础元素，卡片用官网同一渲染器真实预览（复用 LibraryCard）。
 * 与编辑器右侧抽屉的「插入」语境不同，这里是只读浏览：点击卡片打开详情弹窗，
 * 提供放大预览、缩放/底色调节与元数据，并可一键前往「页面装修」把组件插入页面。
 * 数据源只有 sectionRegistry：新增组件自动进库、类型下线自动消失。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import SectionRenderer from '@/website/SectionRenderer.vue';
import LibraryCard from '../components/LibraryCard.vue';
import WebsiteFrame from '@/website/WebsiteFrame.vue';
import { PREVIEW_DEVICES, deviceWidthOf, fitScale } from '@/website/previewFrame';
import { libraryDemoBlocks } from '@/website/libraryDemo';
import {
  ATOM_GROUP,
  DATA_DRIVEN_TYPES,
  SECTION_GROUPS,
  SECTION_REGISTRY,
  blockAccepts,
  type BlockLayer,
} from '@/website/sectionRegistry';

const router = useRouter();

interface LibItem {
  type: string;
  label: string;
  group: string;
  layer: BlockLayer;
}

/** 分组配色：让每个分组在页头、 chips、卡片节标题上有一致的色彩标识 */
const GROUP_COLORS: Record<string, string> = {
  头部与首屏: '#2f6bff',
  图文内容: '#12b8a6',
  数据驱动: '#f5a623',
  转化组件: '#d6409f',
  [ATOM_GROUP]: '#ff7a1a',
};
const groupColor = (g: string): string => GROUP_COLORS[g] ?? '#2f6bff';

/** 全量清单（注册表驱动） */
const allItems = computed<LibItem[]>(() =>
  Object.entries(SECTION_REGISTRY)
    .filter(([, meta]) => (meta.layer ?? 'module') === 'atom' ? meta.group === ATOM_GROUP : SECTION_GROUPS.includes(meta.group))
    .map(([type, meta]) => ({ type, label: meta.label, group: meta.group, layer: meta.layer ?? 'module' }))
);
const moduleCount = computed(() => allItems.value.filter((i) => i.layer === 'module').length);
const atomCount = computed(() => allItems.value.filter((i) => i.layer === 'atom').length);
const groupCount = computed(() => new Set(allItems.value.map((i) => i.group)).size);

/** 筛选状态 */
const keyword = ref('');
const layerFilter = ref<'all' | 'module' | 'atom'>('all');
const groupFilter = ref('all');
const sortMode = ref<'group' | 'name'>('group');

const layerOptions = [
  { value: 'all', label: '全部' },
  { value: 'module', label: '模块' },
  { value: 'atom', label: '基础元素' },
] as const;

/** 当前层级下可选的分组 chips */
const groupChips = computed(() => {
  if (layerFilter.value === 'atom') return [ATOM_GROUP];
  if (layerFilter.value === 'module') return [...SECTION_GROUPS];
  return [...SECTION_GROUPS, ATOM_GROUP];
});
watch(layerFilter, () => {
  if (groupFilter.value !== 'all' && !groupChips.value.includes(groupFilter.value)) groupFilter.value = 'all';
});

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return allItems.value
    .filter((i) => layerFilter.value === 'all' || i.layer === layerFilter.value)
    .filter((i) => groupFilter.value === 'all' || i.group === groupFilter.value)
    .filter((i) => !kw || `${i.label} ${i.type} ${i.group}`.toLowerCase().includes(kw))
    .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label, 'zh') : a.group.localeCompare(b.group, 'zh')));
});
const resultCount = computed(() => filtered.value.length);

interface Section { group: string; color: string; items: LibItem[] }
const sections = computed<Section[]>(() => {
  const list = filtered.value;
  if (sortMode.value === 'name') {
    return list.length
      ? [{ group: '全部组件', color: '#2f6bff', items: [...list].sort((a, b) => a.label.localeCompare(b.label, 'zh')) }]
      : [];
  }
  return [...SECTION_GROUPS, ATOM_GROUP]
    .map((g) => ({ group: g, color: groupColor(g), items: list.filter((i) => i.group === g) }))
    .filter((s) => s.items.length > 0);
});

function resetFilters(): void {
  keyword.value = '';
  layerFilter.value = 'all';
  groupFilter.value = 'all';
  sortMode.value = 'group';
}
function goDecoration(): void {
  router.push('/admin/pages');
}

/** 详情弹窗 */
interface Detail extends LibItem {
  accepts: BlockLayer[];
  bandText: string;
  fieldCount: number;
  dataDriven: boolean;
}
const dialogVisible = ref(false);
const selected = ref<Detail | null>(null);
// 详情只渲染被点击的组件本身，不塞示例子内容（否则一个模块的预览里会混进标题组与文字两个别的组件）
const demoBlocks = computed(() =>
  selected.value ? libraryDemoBlocks(selected.value.type, { withDemoChildren: false }) : []
);
const isAtomDetail = computed(() => selected.value?.layer === 'atom');

const acceptsText = computed(() => {
  const a = selected.value?.accepts ?? [];
  if (a.includes('atom')) return '可装载基础元素';
  return '不可装载子内容';
});

/** 预览舞台：设备视口宽度决定官网断点，倍率只负责把画面缩到弹窗放得下 */
const previewWrap = ref<HTMLElement | null>(null);
const wrapWidth = ref(880);
const naturalHeight = ref(0);
const zoom = ref(1);
const device = ref('desktop');
const backdrop = ref<'white' | 'paper' | 'dark'>('paper');
const backdropOptions = [
  { value: 'white', label: '白' },
  { value: 'paper', label: '纸白' },
  { value: 'dark', label: '深色' },
] as const;

const deviceWidth = computed(() => deviceWidthOf(device.value));
const displayScale = computed(() => fitScale(wrapWidth.value, deviceWidth.value) * zoom.value);
const zoomPercent = computed(() => Math.round(displayScale.value * 100));

let ro: ResizeObserver | undefined;
function measure(): void {
  // 预览视口左右各 16px 内边距，可用宽度要扣掉
  if (previewWrap.value) wrapWidth.value = Math.max(240, previewWrap.value.clientWidth - 32);
}

function onPreviewResize(height: number): void {
  naturalHeight.value = height;
}

function onPreviewBlocked(target: string): void {
  ElMessage.info(target === 'form' ? '预览内不提交表单' : `预览内不跳转：${target}`);
}

async function openDetail(type: string): Promise<void> {
  const meta = SECTION_REGISTRY[type];
  if (!meta) return;
  const layer = meta.layer ?? 'module';
  const band = meta.band;
  selected.value = {
    type,
    label: meta.label,
    group: meta.group,
    layer,
    accepts: blockAccepts(type),
    bandText: band
      ? `${band.form === 'bleed' ? '通栏底色' : '卡片底色'} · ${band.source === 'fixed' ? '固定' : band.source === 'themeable' ? '可切换' : '未指定'}`
      : '未指定',
    fieldCount: meta.formSchema.length,
    dataDriven: DATA_DRIVEN_TYPES.includes(type),
  };
  zoom.value = 1;
  device.value = 'desktop';
  naturalHeight.value = 0;
  dialogVisible.value = true;
  await nextTick();
  requestAnimationFrame(() => {
    measure();
    requestAnimationFrame(measure);
  });
}

watch(dialogVisible, async (v) => {
  if (v) {
    await nextTick();
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      if (previewWrap.value) ro.observe(previewWrap.value);
    }
  } else {
    ro?.disconnect();
    ro = undefined;
  }
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div class="cl-page">
    <!-- 页头品牌带 -->
    <header class="cl-hero">
      <div class="cl-hero-glow cl-hero-glow-a"></div>
      <div class="cl-hero-glow cl-hero-glow-b"></div>
      <div class="cl-hero-grain"></div>
      <div class="cl-hero-main">
        <span class="cl-eyebrow">PAGE BUILDER · 页面配置</span>
        <h1 class="cl-title">组件库</h1>
        <p class="cl-sub">
          官网由这些模块与基础元素拼装而成。此处可真实预览每个组件的效果与可编辑字段，
          在「页面装修」编辑器右侧抽屉中即可把它们插入页面。
        </p>
      </div>
      <div class="cl-hero-side">
        <div class="cl-stats">
          <div class="cl-stat">
            <span class="cl-stat-num">{{ moduleCount }}</span>
            <span class="cl-stat-label">模块</span>
          </div>
          <div class="cl-stat">
            <span class="cl-stat-num">{{ atomCount }}</span>
            <span class="cl-stat-label">基础元素</span>
          </div>
          <div class="cl-stat">
            <span class="cl-stat-num">{{ groupCount }}</span>
            <span class="cl-stat-label">分组</span>
          </div>
        </div>
        <button type="button" class="cl-cta" @click="goDecoration">
          前往页面装修
          <el-icon class="cl-cta-icon"><ArrowRight /></el-icon>
        </button>
      </div>
    </header>

    <!-- 工具栏 -->
    <div class="cl-toolbar">
      <el-input v-model="keyword" class="cl-search" placeholder="搜索组件名称 / 类型 / 分组" clearable>
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <div class="cl-seg" role="tablist" aria-label="层级筛选">
        <button
          v-for="opt in layerOptions"
          :key="opt.value"
          type="button"
          class="cl-seg-btn"
          :class="{ active: layerFilter === opt.value }"
          @click="layerFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <el-select v-model="sortMode" class="cl-sort" size="default">
        <el-option label="按分组排列" value="group" />
        <el-option label="按名称 A→Z" value="name" />
      </el-select>
      <span class="cl-count">共 <b>{{ resultCount }}</b> 个组件</span>
    </div>

    <!-- 分组 chips -->
    <div class="cl-chips">
      <button
        type="button"
        class="cl-chip"
        :class="{ active: groupFilter === 'all' }"
        @click="groupFilter = 'all'"
      >
        全部分组
      </button>
      <button
        v-for="g in groupChips"
        :key="g"
        type="button"
        class="cl-chip"
        :class="{ active: groupFilter === g }"
        :style="{ '--chip': groupColor(g) }"
        @click="groupFilter = g"
      >
        <span class="cl-chip-dot"></span>{{ g }}
      </button>
    </div>

    <!-- 分组卡片网格 -->
    <div class="cl-body">
      <template v-if="sections.length">
        <section v-for="sec in sections" :key="sec.group" class="cl-section">
          <div class="cl-section-head" :style="{ '--sec': sec.color }">
            <span class="cl-section-bar"></span>
            <h2 class="cl-section-title">{{ sec.group }}</h2>
            <span class="cl-section-count">{{ sec.items.length }}</span>
          </div>
          <div class="cl-grid">
            <LibraryCard
              v-for="item in sec.items"
              :key="item.type"
              :item="{ type: item.type, label: item.label, group: item.group }"
              @pick="openDetail"
            />
          </div>
        </section>
      </template>
      <div v-else class="cl-empty">
        <el-empty description="没有匹配的组件">
          <el-button type="primary" plain @click="resetFilters">清空筛选</el-button>
        </el-empty>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="selected?.label || '组件详情'"
      width="min(1080px, 92vw)"
      top="6vh"
      class="cl-dialog"
      append-to-body
      destroy-on-close
    >
      <div v-if="selected" class="cl-detail">
        <div class="cl-detail-preview">
          <div class="cl-preview-bar">
            <span class="cl-preview-tag" :style="{ '--sec': groupColor(selected.group) }">{{ selected.group }}</span>
            <span class="cl-layer-badge" :class="selected.layer">{{ selected.layer === 'module' ? '模块' : '基础元素' }}</span>
            <span v-if="selected.dataDriven" class="cl-data-badge">数据驱动</span>
            <div class="cl-preview-tools">
              <div class="cl-device-seg" role="group" aria-label="设备视口">
                <button
                  v-for="d in PREVIEW_DEVICES"
                  :key="d.key"
                  type="button"
                  class="cl-device-btn"
                  :class="{ active: device === d.key }"
                  :title="`${d.label} ${d.width}px`"
                  @click="device = d.key"
                >
                  {{ d.label }}
                </button>
              </div>
              <div class="cl-backdrop-seg">
                <button
                  v-for="b in backdropOptions"
                  :key="b.value"
                  type="button"
                  class="cl-backdrop-btn"
                  :class="{ active: backdrop === b.value }"
                  @click="backdrop = b.value"
                >
                  {{ b.label }}
                </button>
              </div>
              <div class="cl-zoom">
                <el-icon class="cl-zoom-icon"><ZoomIn /></el-icon>
                <el-slider v-model="zoom" :min="0.5" :max="1.5" :step="0.05" :show-tooltip="false" class="cl-zoom-slider" />
                <span class="cl-zoom-val">{{ zoomPercent }}%</span>
              </div>
            </div>
          </div>
          <div class="cl-preview-readout">
            <span class="cl-readout-dot"></span>
            官网同源渲染 · 仅当前组件 · 视口 {{ deviceWidth }}px · 显示 {{ zoomPercent }}%
            <template v-if="naturalHeight">· 内容 {{ naturalHeight }}px</template>
            <span class="cl-readout-hint">断点按视口宽度判定，与后台窗口宽度无关</span>
          </div>
          <div ref="previewWrap" class="cl-preview-viewport" :class="`bd-${backdrop}`">
            <WebsiteFrame
              class="cl-preview-frame"
              :device-width="deviceWidth"
              :scale="displayScale"
              :title="`${selected.label} 效果预览`"
              @resize="onPreviewResize"
              @blocked="onPreviewBlocked"
            >
              <div v-if="isAtomDetail" class="container cl-atom-context">
                <SectionRenderer :blocks="demoBlocks" preview demo />
              </div>
              <SectionRenderer v-else :blocks="demoBlocks" preview demo />
            </WebsiteFrame>
          </div>
        </div>

        <aside class="cl-detail-meta">
          <h3 class="cl-meta-title">组件信息</h3>
          <dl class="cl-meta-list">
            <div class="cl-meta-row">
              <dt>类型标识</dt>
              <dd><code class="cl-code">{{ selected.type }}</code></dd>
            </div>
            <div class="cl-meta-row">
              <dt>所属分组</dt>
              <dd><span class="cl-meta-dot" :style="{ background: groupColor(selected.group) }"></span>{{ selected.group }}</dd>
            </div>
            <div class="cl-meta-row">
              <dt>层级</dt>
              <dd>{{ selected.layer === 'module' ? '模块（整页背景带）' : '基础元素（装入模块）' }}</dd>
            </div>
            <div class="cl-meta-row">
              <dt>子内容</dt>
              <dd>{{ acceptsText }}</dd>
            </div>
            <div class="cl-meta-row">
              <dt>背景带</dt>
              <dd>{{ selected.bandText }}</dd>
            </div>
            <div class="cl-meta-row">
              <dt>可编辑字段</dt>
              <dd>{{ selected.fieldCount }} 项</dd>
            </div>
          </dl>
          <p class="cl-meta-note">
            预览只渲染当前这一个组件，不掺入其它组件的示例；样式环境与官网相同（同源隔离宿主 + 官网样式原文），
            版式、间距、字体与配色与上线后一致，切换设备视口即可看到对应断点下的真实版式。
            内容为组件内置样例，插入页面后可在编辑器中栏「内容编辑」逐字段修改；可装载子内容的模块，其子内容位插入后才会有内容。
          </p>
        </aside>
      </div>
      <template #footer>
        <div class="cl-dialog-footer">
          <span class="cl-dialog-hint">想把组件用到页面上？</span>
          <div class="cl-dialog-actions">
            <el-button @click="dialogVisible = false">关闭</el-button>
            <el-button type="primary" @click="goDecoration">
              前往页面装修
              <el-icon class="cl-cta-icon"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<!-- 调色板变量定义在 :root（非 scoped）：详情弹窗 append-to-body  teleport 到 .cl-page 之外，
     只有全局变量才能被其继承；变量均以 --cl- 命名空间隔离，不影响后台其它页面 -->
<style>
:root {
  --cl-ink: #0f1b2d;
  --cl-ink-2: #16233a;
  --cl-blue: #2f6bff;
  --cl-orange: #ff7a1a;
  --cl-paper: #f6f1e7;
  --cl-line: #e7ebf2;
  --cl-text: #1f2a3a;
  --cl-muted: #6b7787;
}
</style>

<style scoped>
.cl-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--cl-text);
}

/* 页头品牌带 */
.cl-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  flex-wrap: wrap;
  padding: 30px 34px;
  border-radius: 18px;
  background:
    radial-gradient(120% 140% at 12% 0%, #1d3a6e 0%, rgba(29, 58, 110, 0) 55%),
    linear-gradient(120deg, var(--cl-ink) 0%, var(--cl-ink-2) 48%, #1b3a72 100%);
  box-shadow: 0 18px 40px -24px rgba(15, 27, 45, 0.7);
}
.cl-hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.5;
  pointer-events: none;
}
.cl-hero-glow-a {
  width: 320px;
  height: 320px;
  top: -120px;
  right: 8%;
  background: radial-gradient(circle, var(--cl-blue), transparent 70%);
  animation: cl-drift 14s ease-in-out infinite;
}
.cl-hero-glow-b {
  width: 260px;
  height: 260px;
  bottom: -140px;
  right: 26%;
  background: radial-gradient(circle, var(--cl-orange), transparent 70%);
  opacity: 0.35;
  animation: cl-drift 18s ease-in-out infinite reverse;
}
@keyframes cl-drift {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(-26px, 18px, 0); }
}
.cl-hero-grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.cl-hero-main {
  position: relative;
  z-index: 1;
  max-width: 620px;
}
.cl-eyebrow {
  display: inline-block;
  font-size: 12px;
  letter-spacing: 2px;
  font-weight: 600;
  color: #9fc0ff;
  padding: 4px 10px;
  border: 1px solid rgba(159, 192, 255, 0.35);
  border-radius: 999px;
  margin-bottom: 14px;
}
.cl-title {
  margin: 0;
  font-size: 38px;
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
}
.cl-sub {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.8;
  color: #c4d2e8;
}
.cl-hero-side {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 18px;
}
.cl-stats {
  display: flex;
  gap: 12px;
}
.cl-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 78px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(4px);
}
.cl-stat-num {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}
.cl-stat-label {
  font-size: 12px;
  color: #aebdd4;
}
.cl-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  background: linear-gradient(120deg, var(--cl-orange), #ff9a3d);
  box-shadow: 0 12px 26px -12px rgba(255, 122, 26, 0.9);
  transition: transform 0.15s, box-shadow 0.15s;
}
.cl-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px -12px rgba(255, 122, 26, 1);
}
.cl-cta-icon {
  font-size: 16px;
}

/* 工具栏 */
.cl-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.cl-search {
  width: 300px;
  max-width: 100%;
}
.cl-seg {
  display: inline-flex;
  padding: 3px;
  background: #eef1f7;
  border-radius: 11px;
}
.cl-seg-btn {
  border: none;
  background: none;
  padding: 7px 18px;
  font-size: 14px;
  color: var(--cl-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.cl-seg-btn.active {
  background: #fff;
  color: var(--cl-blue);
  font-weight: 600;
  box-shadow: 0 2px 8px -3px rgba(15, 27, 45, 0.3);
}
.cl-sort {
  width: 150px;
}
.cl-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--cl-muted);
}
.cl-count b {
  color: var(--cl-blue);
  font-size: 16px;
}

/* 分组 chips */
.cl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cl-chip {
  --chip: var(--cl-blue);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--cl-muted);
  background: #fff;
  border: 1px solid var(--cl-line);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}
.cl-chip:hover {
  border-color: var(--chip);
  color: var(--chip);
}
.cl-chip.active {
  background: var(--chip);
  border-color: var(--chip);
  color: #fff;
}
.cl-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chip);
}
.cl-chip.active .cl-chip-dot {
  background: #fff;
}

/* 分组节 + 卡片网格 */
.cl-body {
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.cl-section-head {
  --sec: var(--cl-blue);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.cl-section-bar {
  width: 5px;
  height: 20px;
  border-radius: 3px;
  background: var(--sec);
}
.cl-section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--cl-text);
}
.cl-section-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--sec);
  background: color-mix(in srgb, var(--sec) 12%, #fff);
  padding: 2px 10px;
  border-radius: 999px;
}
.cl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}
/* LibraryCard 自带 margin-bottom，网格里去掉以免行距叠加 */
.cl-grid :deep(.lib-cell) {
  margin-bottom: 0;
}
.cl-empty {
  padding: 40px 0;
}

/* 详情弹窗 */
.cl-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
}
.cl-detail-preview {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cl-preview-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cl-preview-tag {
  --sec: var(--cl-blue);
  font-size: 12px;
  font-weight: 600;
  color: var(--sec);
  background: color-mix(in srgb, var(--sec) 12%, #fff);
  padding: 3px 10px;
  border-radius: 999px;
}
.cl-layer-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  color: #fff;
  background: var(--cl-blue);
}
.cl-layer-badge.atom {
  background: var(--cl-orange);
}
.cl-data-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  color: #b8860b;
  background: #fdf3d7;
}
.cl-preview-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.cl-backdrop-seg {
  display: inline-flex;
  padding: 2px;
  background: #eef1f7;
  border-radius: 9px;
}
.cl-backdrop-btn {
  border: none;
  background: none;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--cl-muted);
  border-radius: 7px;
  cursor: pointer;
}
.cl-backdrop-btn.active {
  background: #fff;
  color: var(--cl-blue);
  font-weight: 600;
}
.cl-zoom {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cl-zoom-icon {
  font-size: 16px;
  color: var(--cl-muted);
}
.cl-zoom-slider {
  width: 110px;
}
.cl-zoom-val {
  font-size: 12px;
  color: var(--cl-muted);
  min-width: 38px;
  text-align: right;
}
.cl-preview-viewport {
  position: relative;
  overflow: auto;
  max-height: 62vh;
  border: 1px solid var(--cl-line);
  border-radius: 12px;
  padding: 16px;
  transition: background 0.2s;
  scrollbar-width: thin;
  scrollbar-color: #c3cddf var(--cl-paper);
}
.cl-preview-viewport::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.cl-preview-viewport::-webkit-scrollbar-track {
  background: transparent;
}
.cl-preview-viewport::-webkit-scrollbar-thumb {
  background: #c3cddf;
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
}
.cl-preview-viewport::-webkit-scrollbar-thumb:hover {
  background: var(--cl-blue);
  background-clip: padding-box;
}
.cl-preview-viewport.bd-white { background: #ffffff; }
.cl-preview-viewport.bd-paper { background: var(--cl-paper); }
.cl-preview-viewport.bd-dark { background: #101725; }
.cl-preview-frame {
  margin: 0 auto;
}
/* 基础元素在官网是装在模块容器里的，预览给同样的容器上下文 */
.cl-atom-context {
  padding-top: 40px;
  padding-bottom: 40px;
}
.cl-device-seg {
  display: inline-flex;
  padding: 2px;
  background: #eef1f7;
  border-radius: 9px;
}
.cl-device-btn {
  border: none;
  background: none;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--cl-muted);
  border-radius: 7px;
  cursor: pointer;
}
.cl-device-btn.active {
  background: var(--cl-ink);
  color: #fff;
  font-weight: 600;
}
.cl-preview-readout {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--cl-muted);
}
.cl-readout-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #17b26a;
  box-shadow: 0 0 0 3px rgba(23, 178, 106, 0.16);
}
.cl-readout-hint {
  margin-left: auto;
  color: #9aa5b4;
}

/* 元数据侧栏 */
.cl-detail-meta {
  border-left: 1px solid var(--cl-line);
  padding-left: 20px;
}
.cl-meta-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
}
.cl-meta-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cl-meta-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cl-meta-row dt {
  font-size: 12px;
  color: var(--cl-muted);
}
.cl-meta-row dd {
  margin: 0;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.cl-meta-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cl-code {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
  background: #eef1f7;
  color: var(--cl-blue);
  padding: 2px 8px;
  border-radius: 6px;
}
.cl-meta-note {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--cl-muted);
  background: #f7f9fc;
  border-radius: 10px;
  padding: 12px 14px;
}
.cl-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.cl-dialog-hint {
  font-size: 13px;
  color: var(--cl-muted);
}
.cl-dialog-actions {
  display: flex;
  gap: 10px;
}

/* 自定义滚动条（页面预览视口） */
.cl-preview-viewport::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.cl-preview-viewport::-webkit-scrollbar-track {
  background: rgba(47, 107, 255, 0.06);
  border-radius: 8px;
}
.cl-preview-viewport::-webkit-scrollbar-thumb {
  background: rgba(47, 107, 255, 0.32);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.cl-preview-viewport::-webkit-scrollbar-thumb:hover {
  background: rgba(47, 107, 255, 0.55);
  background-clip: content-box;
}

/* 响应式 */
@media (max-width: 900px) {
  .cl-detail {
    grid-template-columns: 1fr;
  }
  .cl-detail-meta {
    border-left: none;
    border-top: 1px solid var(--cl-line);
    padding-left: 0;
    padding-top: 16px;
  }
}
@media (max-width: 560px) {
  .cl-hero {
    padding: 24px 20px;
  }
  .cl-title {
    font-size: 30px;
  }
  .cl-hero-side {
    align-items: flex-start;
    width: 100%;
  }
  .cl-grid {
    grid-template-columns: 1fr;
  }
  .cl-search {
    width: 100%;
  }
  .cl-count {
    margin-left: 0;
  }
  .cl-preview-tools {
    margin-left: 0;
    width: 100%;
  }
}
</style>