<script setup lang="ts">
// 通用富文本区块：正文 HTML 已经过后端 sanitize 清洗
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead v-if="p.eyebrow || p.title" :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div class="rich-text" v-html="p.html || ''"></div>
    </div>
  </section>
</template>

<style scoped>
.rich-text { font-size: 15px; line-height: 1.9; color: var(--ink-600); }
.rich-text :deep(h2), .rich-text :deep(h3) { color: var(--ink-900); margin: 24px 0 12px; }
.rich-text :deep(p) { margin: 0 0 14px; }
.rich-text :deep(ul) { padding-left: 20px; margin: 0 0 14px; }
.rich-text :deep(img) { border-radius: var(--r-lg); margin: 12px 0; }
</style>
