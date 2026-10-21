<script setup lang="ts">
// 时间线区块：品牌历程 / 服务流程（sec-head + timeline）
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div class="timeline">
        <div class="tl-item" v-for="(it, i) in p.items || []" :key="i">
          <div class="tl-year">{{ it.year }}</div>
          <h4>{{ it.title }}</h4>
          <p>{{ it.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
