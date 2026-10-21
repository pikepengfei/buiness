<script setup lang="ts">
// 区块图标：按 key 渲染内置 stroke SVG，保证图标风格固定
import { SECTION_ICONS } from '../icons';

const props = defineProps<{ name: string; size?: number }>();
</script>

<template>
  <svg
    :width="size || 24"
    :height="size || 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="2"
    v-if="SECTION_ICONS[props.name]"
  >
    <path v-for="(d, i) in SECTION_ICONS[props.name]" :key="i" :d="d" />
  </svg>
</template>
