<script setup lang="ts">
// 多类别卡片区块：质保政策 / 按场景选择（sec-head + cat-grid，可选内置图标与要点列表）
import SecHead from './SecHead.vue';
import SecIcon from './SecIcon.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div class="cat-grid">
        <div class="cat-card" v-for="(it, i) in p.items || []" :key="i">
          <div class="num">{{ it.num }}</div>
          <div class="ic" v-if="it.icon"><SecIcon :name="it.icon" :size="26" /></div>
          <h3>{{ it.title }}</h3>
          <p>{{ it.text }}</p>
          <ul v-if="it.bullets?.length">
            <li v-for="(b, j) in it.bullets" :key="j">{{ b }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
