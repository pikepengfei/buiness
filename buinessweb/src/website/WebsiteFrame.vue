<script setup lang="ts">
/**
 * 官网预览宿主组件：把插槽内容渲染进同源 iframe，拿到与官网一致的样式与响应式环境。
 *
 * 用 Teleport 而不是第二个应用实例：节点被 iframe 文档收养后按其样式表计算，
 * 而组件仍属于当前应用，router / pinia / 响应式与 scoped 标识全部不变，内容一改即时同步。
 * 设备宽度就是 iframe 的 CSS 宽度，媒体查询与 vh/vw 因此按设备真实判定；
 * scale 只作用于外壳，不参与断点判定。
 */
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, watch } from 'vue';
import { createPreviewHost, type PreviewHost } from './previewFrame';

const props = withDefaults(
  defineProps<{
    /** 设备视口宽度（CSS px），决定官网断点命中 */
    deviceWidth: number;
    /** 显示倍率，只改变显示大小 */
    scale?: number;
    /** 固定视口高度（设备 px）；不传则按内容自动高度 */
    viewportHeight?: number | null;
    /** false 时屏蔽指针事件，点击交给外层（组件卡片语境） */
    interactive?: boolean;
    title?: string;
  }>(),
  { scale: 1, viewportHeight: null, interactive: true, title: '组件效果预览' }
);

const emit = defineEmits<{
  (e: 'ready'): void;
  (e: 'error', message: string): void;
  (e: 'resize', height: number): void;
  (e: 'blocked', target: string): void;
}>();

const frameEl = ref<HTMLIFrameElement | null>(null);
const mount = ref<HTMLElement | null>(null);
const state = ref<'pending' | 'ready' | 'error'>('pending');
const naturalHeight = ref(0);

let host: PreviewHost | undefined;
let contentRo: ResizeObserver | undefined;
let attachAttempts = 0;

const safeScale = computed(() => (props.scale > 0 ? props.scale : 1));
const frameHeight = computed(() => props.viewportHeight ?? Math.max(naturalHeight.value, 1));
const outerStyle = computed(() => ({
  width: `${Math.round(props.deviceWidth * safeScale.value)}px`,
  height: `${Math.round(frameHeight.value * safeScale.value)}px`,
}));
const frameStyle = computed(() => ({
  width: `${props.deviceWidth}px`,
  height: `${frameHeight.value}px`,
  transform: `scale(${safeScale.value})`,
  pointerEvents: props.interactive ? ('auto' as const) : ('none' as const),
}));

function measure(): void {
  if (!host || props.viewportHeight != null) return;
  const doc = host.doc;
  const height = Math.ceil(
    Math.max(host.mount.getBoundingClientRect().height, doc.body?.scrollHeight ?? 0)
  );
  if (height > 0 && height !== naturalHeight.value) {
    naturalHeight.value = height;
    emit('resize', height);
  }
}

function onLinkClick(e: Event): void {
  const target = e.target as HTMLElement | null;
  const link = target?.closest?.('a[href]');
  if (!link) return;
  e.preventDefault();
  emit('blocked', link.getAttribute('href') || '');
}

function onSubmit(e: Event): void {
  e.preventDefault();
  emit('blocked', 'form');
}

/** 图片加载完成会改变内容高度；load 不冒泡，只能在文档上捕获 */
function onAssetSettled(): void {
  measure();
}

function cleanup(): void {
  contentRo?.disconnect();
  contentRo = undefined;
  frameEl.value?.removeEventListener('load', onFrameAttached);
  if (host) {
    host.doc.removeEventListener('click', onLinkClick, true);
    host.doc.removeEventListener('submit', onSubmit, true);
    host.doc.removeEventListener('load', onAssetSettled, true);
    host.doc.removeEventListener('error', onAssetSettled, true);
    host.destroy();
    host = undefined;
  }
  mount.value = null;
}

/** iframe 还没接入文档时拿不到 contentDocument，接入后会补一次 load */
function onFrameAttached(): void {
  void boot();
}

async function boot(): Promise<void> {
  cleanup();
  state.value = 'pending';
  naturalHeight.value = 0;
  await nextTick();
  const el = frameEl.value;
  if (!el) return;
  if (!el.contentDocument) {
    if (attachAttempts < 3) {
      attachAttempts += 1;
      el.addEventListener('load', onFrameAttached, { once: true });
      return;
    }
    state.value = 'error';
    emit('error', '无法建立预览文档');
    return;
  }
  attachAttempts = 0;
  try {
    host = createPreviewHost(el);
    host.doc.addEventListener('click', onLinkClick, true);
    host.doc.addEventListener('submit', onSubmit, true);
    host.doc.addEventListener('load', onAssetSettled, true);
    host.doc.addEventListener('error', onAssetSettled, true);
    const win = host.doc.defaultView;
    if (win && typeof win.ResizeObserver !== 'undefined') {
      contentRo = new win.ResizeObserver(() => measure());
      contentRo.observe(host.mount);
    }
    mount.value = host.mount;
    state.value = 'ready';
    emit('ready');
    await nextTick();
    measure();
    requestAnimationFrame(measure);
  } catch (e) {
    state.value = 'error';
    emit('error', e instanceof Error ? e.message : String(e));
  }
}

watch(
  () => props.deviceWidth,
  async () => {
    await nextTick();
    measure();
    requestAnimationFrame(measure);
  }
);
onMounted(boot);
onUpdated(() => measure());
// 卸载后才回收宿主：Teleport 的内容要先由 Vue 自己从目标文档移除
onUnmounted(cleanup);

defineExpose({ remeasure: measure });
</script>

<template>
  <div class="wf" :style="outerStyle">
    <iframe ref="frameEl" class="wf-frame" :style="frameStyle" :title="title"></iframe>
    <div v-if="state !== 'ready'" class="wf-state" :class="{ 'is-error': state === 'error' }">
      <template v-if="state === 'pending'">
        <span class="wf-spin"></span>
        <span>正在载入官网样式…</span>
      </template>
      <template v-else>
        <span>预览环境建立失败，组件内容未渲染</span>
        <button type="button" class="wf-retry" @click="boot">重试</button>
      </template>
    </div>
    <Teleport v-if="mount" :to="mount">
      <slot />
    </Teleport>
  </div>
</template>

<style scoped>
.wf {
  position: relative;
  overflow: hidden;
  flex: none;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 10px 30px -18px rgba(15, 27, 45, 0.55);
}
.wf-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  display: block;
  transform-origin: top left;
  background: #fff;
}
.wf-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: #6b7787;
  background: linear-gradient(140deg, #fbf7f1 0%, #f2f5fb 100%);
}
.wf-state.is-error {
  flex-direction: column;
  color: #b4442e;
  background: linear-gradient(140deg, #fdf3ef 0%, #f7f2ec 100%);
}
.wf-spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(222, 100, 32, 0.25);
  border-top-color: #de6420;
  animation: wf-spin 0.7s linear infinite;
}
.wf-retry {
  border: 1px solid rgba(222, 100, 32, 0.4);
  background: #fff;
  color: #de6420;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.wf-retry:hover {
  background: #de6420;
  color: #fff;
}
@keyframes wf-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>