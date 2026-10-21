<script setup lang="ts">
// 品牌/公司介绍区块：sec-head + eco-grid 三栏
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div class="eco-grid">
        <div class="eco-row" v-for="(it, i) in p.items || []" :key="i">
          <h4>{{ it.h4 }}</h4>
          <p>{{ it.p }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
