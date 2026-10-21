<script setup lang="ts">
// 使命与愿景区块：sec-head + mvv-grid 双卡
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div class="mvv-grid">
        <div class="mvv-card" v-for="(c, i) in p.cards || []" :key="i">
          <div class="mvv-tag">{{ c.tag }}</div>
          <p>{{ c.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
