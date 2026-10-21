<script setup lang="ts">
/**
 * 区块渲染器：按 blocks 顺序（过滤 visible=false）渲染对应区块组件
 * - 官网前台：getPage(slug).blocks 直接渲染
 * - 管理端编辑器：传入草稿 blocks + preview=true（表单类区块禁用真实提交）
 * - 未知 type 静默跳过，保证前向兼容
 */
import { computed } from 'vue';
import type { Block } from './blocks';
import { SECTION_REGISTRY } from './sectionRegistry';

const props = defineProps<{ blocks: Block[]; preview?: boolean }>();

const renderable = computed(() =>
  (props.blocks || []).filter((b) => b.visible !== false && SECTION_REGISTRY[b.type])
);
</script>

<template>
  <div class="section-renderer">
    <component
      v-for="blk in renderable"
      :is="SECTION_REGISTRY[blk.type].component"
      :key="blk.id"
      :p="blk.props || {}"
      :preview="preview"
    />
  </div>
</template>

<style scoped>
.section-renderer { display: block; }
</style>
