<script lang="ts">
/**
 * 卡片预览宿主的保活预算（模块级，跨卡片共享）。
 * 一个宿主约 400KB 样式文本 + 一份独立文档，23 张卡片全量常驻会吃穿内存；
 * 超出上限时只淘汰「当前不可见」的卡片，正在看的预览不会被换成占位。
 */
const LIVE_LIMIT = 8;

interface LiveEntry {
  visible: boolean;
  seen: number;
  evict: () => void;
}

const liveEntries = new Set<LiveEntry>();
let liveClock = 0;

function claimLive(entry: LiveEntry): void {
  entry.seen = ++liveClock;
  liveEntries.add(entry);
  while (liveEntries.size > LIVE_LIMIT) {
    let oldest: LiveEntry | undefined;
    for (const candidate of liveEntries) {
      if (candidate.visible) continue;
      if (!oldest || candidate.seen < oldest.seen) oldest = candidate;
    }
    if (!oldest) break;
    liveEntries.delete(oldest);
    oldest.evict();
  }
}

function forgetLive(entry: LiveEntry): void {
  liveEntries.delete(entry);
}
</script>

<script setup lang="ts">
/**
 * 组件库卡片：用官网同一渲染器 + 同源隔离宿主展示组件的真实效果。
 * - 模块按桌面视口（1440px）渲染，再按卡片实际宽度等比缩小；基础元素按卡片宽度 1:1 渲染
 * - 只渲染当前这一个组件，不掺示例子内容
 * - 懒挂载：进入可视区才建宿主，滚出后按保活预算回收，再次可见时重建
 * - 预览屏蔽指针事件，点击统一落到外层的插入动作，避免误触组件内部链接
 * - 保留 .lib-cell / .lib-label / .lib-type / .lib-reason / data-lib-type DOM 契约
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import SectionRenderer from '@/website/SectionRenderer.vue';
import WebsiteFrame from '@/website/WebsiteFrame.vue';
import { libraryDemoBlocks } from '@/website/libraryDemo';
import { blockLayer } from '@/website/sectionRegistry';
import { deviceWidthOf } from '@/website/previewFrame';
import type { Block } from '@/website/blocks';

const props = defineProps<{
  item: { type: string; label: string; group: string; reason?: string };
  /** 自定义渲染内容（模板库缩略传入模板自身 Block）；组件库调用方不传时回落类型内置样例 */
  blocks?: Block[];
}>();
const emit = defineEmits<{ (e: 'pick', type: string): void }>();

const MODULE_DEVICE_WIDTH = deviceWidthOf('desktop');

const previewEl = ref<HTMLElement | null>(null);
/** 量到真实宽度前先按常见卡片宽渲染，避免首帧空窗；量到后立即校正比例 */
const previewWidth = ref(320);
const rendered = ref(false);
const contentHeight = ref(0);

let io: IntersectionObserver | undefined;
let ro: ResizeObserver | undefined;

const isAtom = computed(() => blockLayer(props.item.type) === 'atom');
const demo = computed(
  () => props.blocks ?? libraryDemoBlocks(props.item.type, { withDemoChildren: false })
);
const previewHeight = computed(() => (isAtom.value ? 112 : 200));
/** 模块按卡片宽度等比缩小；基础元素本身很小，1:1 才看得清 */
const frameWidth = computed(() =>
  isAtom.value ? Math.max(previewWidth.value, 1) : MODULE_DEVICE_WIDTH
);
const frameScale = computed(() =>
  isAtom.value ? 1 : previewWidth.value / MODULE_DEVICE_WIDTH
);
const ready = computed(() => rendered.value);
const cropped = computed(() => contentHeight.value * frameScale.value > previewHeight.value + 1);

const liveEntry: LiveEntry = {
  visible: false,
  seen: 0,
  evict: () => {
    rendered.value = false;
    contentHeight.value = 0;
  },
};

function activate(): void {
  rendered.value = true;
  claimLive(liveEntry);
}

function measureWidth(): void {
  const width = previewEl.value?.clientWidth ?? 0;
  if (width > 0) previewWidth.value = width;
}

function onResize(height: number): void {
  contentHeight.value = height;
}

onMounted(() => {
  measureWidth();
  if (typeof ResizeObserver !== 'undefined' && previewEl.value) {
    ro = new ResizeObserver(measureWidth);
    ro.observe(previewEl.value);
  }
  if (typeof IntersectionObserver === 'undefined') {
    activate();
    return;
  }
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        liveEntry.visible = entry.isIntersecting;
        if (entry.isIntersecting) activate();
      }
    },
    { rootMargin: '160px' }
  );
  if (previewEl.value) io.observe(previewEl.value);
});

onBeforeUnmount(() => {
  io?.disconnect();
  ro?.disconnect();
  forgetLive(liveEntry);
});

function onClick(): void {
  if (!props.item.reason) emit('pick', props.item.type);
}
</script>

<template>
  <div
    class="lib-cell"
    :class="{ disabled: !!item.reason, 'is-atom': isAtom }"
    :data-lib-type="item.type"
    @click="onClick"
  >
    <div ref="previewEl" class="lib-preview" :style="{ height: previewHeight + 'px' }">
      <WebsiteFrame
        v-if="ready"
        class="lib-frame"
        :device-width="frameWidth"
        :scale="frameScale"
        :interactive="false"
        :title="`${item.label} 效果预览`"
        @resize="onResize"
      >
        <div class="lib-stage" :class="isAtom ? 'stage-atom' : 'stage-module'">
          <div v-if="isAtom" class="container lib-atom-context">
            <SectionRenderer :blocks="demo" preview demo />
          </div>
          <SectionRenderer v-else :blocks="demo" preview demo />
        </div>
      </WebsiteFrame>
      <span v-else class="lib-preview-pending">效果预览</span>
      <span v-if="ready && cropped" class="lib-crop-fade"></span>
      <span class="lib-preview-chip">官网真实效果</span>
    </div>
    <span class="lib-text">
      <span class="lib-label">{{ item.label }}</span>
      <span class="lib-type">{{ item.group }} · {{ item.type }}</span>
      <span v-if="item.reason" class="lib-reason">{{ item.reason }}</span>
    </span>
  </div>
</template>

<style scoped>
.lib-cell {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex-direction: column;
  border: 1px solid #e7ebf2;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 27, 45, 0.04);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.lib-cell:hover {
  border-color: rgba(222, 100, 32, 0.55);
  box-shadow: 0 12px 26px -16px rgba(15, 27, 45, 0.45);
  transform: translateY(-2px);
}
.lib-cell.disabled {
  cursor: not-allowed;
  background: #fafbfc;
  border-color: #eef1f5;
  box-shadow: none;
}
.lib-cell.disabled:hover {
  border-color: #eef1f5;
  box-shadow: none;
  transform: none;
}
.lib-preview {
  position: relative;
  width: 100%;
  overflow: hidden;
  border: 1px solid #eef1f5;
  border-radius: 8px;
  background: #fff;
}
.lib-frame {
  border-radius: 0;
  box-shadow: none;
}
.lib-preview-pending {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #a8b0bd;
  background:
    repeating-linear-gradient(135deg, rgba(222, 100, 32, 0.05) 0 8px, rgba(222, 100, 32, 0) 8px 16px),
    linear-gradient(140deg, #fbf8f4 0%, #f4f6fa 100%);
}
.lib-crop-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 34px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.92) 78%, #fff 100%);
}
.lib-preview-chip {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(222, 100, 32, 0.92);
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
  pointer-events: none;
}
.lib-cell:hover .lib-preview-chip {
  opacity: 1;
  transform: translateY(0);
}
.lib-cell.disabled .lib-preview-chip {
  display: none;
}
.lib-cell.disabled .lib-preview {
  filter: grayscale(0.7);
  opacity: 0.72;
}
.lib-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.lib-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2a3a;
  line-height: 1.4;
}
.lib-cell.disabled .lib-label {
  color: #a8abb2;
}
.lib-type {
  font-size: 11px;
  color: #98a1b0;
  overflow-wrap: anywhere;
}
.lib-reason {
  font-size: 11px;
  line-height: 1.5;
  color: #d48806;
}
</style>
