<script setup lang="ts">
/**
 * 图片基础元素
 *
 * · src 为空时官网不渲染破损图片；管理端预览态给出「图片未选择」提示
 * · ratio / fit / radius 为选填：不填时不输出任何行内样式，保持所在模块的原呈现
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    /** 宽高比，形如 16 / 9（分子、分母任一缺省则不设比例） */
    ratio?: number;
    fit?: 'cover' | 'contain' | 'fill';
    /** 圆角，单位 px */
    radius?: number;
    lazy?: boolean;
    preview?: boolean;
  }>(),
  // 默认不输出 loading 属性：改造前的首屏配图没有该属性，切换基础元素不应改变加载时机
  { src: '', alt: '', ratio: undefined, fit: undefined, radius: undefined, lazy: false, preview: false }
);

const missing = computed(() => !props.src?.trim());

const style = computed(() => {
  const s: Record<string, string> = {};
  if (props.ratio && props.ratio > 0) s.aspectRatio = String(props.ratio);
  if (props.fit) s.objectFit = props.fit;
  if (typeof props.radius === 'number') s.borderRadius = `${props.radius}px`;
  return Object.keys(s).length ? s : undefined;
});
</script>

<template>
  <div v-if="missing && preview" class="ui-image-missing">图片未选择</div>
  <img v-else-if="!missing" :src="src" :alt="alt" :style="style" :loading="lazy ? 'lazy' : undefined" />
</template>

<style scoped>
.ui-image-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 1px dashed var(--ink-300);
  border-radius: var(--r-md);
  background: var(--ink-50);
  color: var(--ink-500);
  font-size: 13px;
}
</style>
