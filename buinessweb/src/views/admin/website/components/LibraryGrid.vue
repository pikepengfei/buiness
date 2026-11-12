<script setup lang="ts">
/** 组件库卡片网格：按传入清单循环渲染，懒渲染由每张卡片自行管理 */
import LibraryCard from './LibraryCard.vue';

defineProps<{
  items: { type: string; label: string; group: string; reason?: string }[];
}>();
const emit = defineEmits<{ (e: 'pick', type: string): void }>();
</script>

<template>
  <div class="lib-grid">
    <LibraryCard
      v-for="item in items"
      :key="item.type"
      :item="item"
      @pick="(type) => emit('pick', type)"
    />
  </div>
</template>

<style scoped>
.lib-grid {
  display: flex;
  flex-direction: column;
}
</style>
