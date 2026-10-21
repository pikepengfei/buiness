<script setup lang="ts">
// 品牌价值观区块：sec-head + values 宫格（内置图标）
import { computed } from 'vue';
import SecHead from './SecHead.vue';
import SecIcon from './SecIcon.vue';

const props = defineProps<{ p: Record<string, any> }>();
const cls = computed(() => (props.p.items?.length === 4 ? 'values four' : 'values'));
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div :class="cls">
        <div class="value" v-for="(it, i) in p.items || []" :key="i">
          <div class="v-ic"><SecIcon :name="it.icon" /></div>
          <h4>{{ it.title }}</h4>
          <div class="en">{{ it.en }}</div>
          <p>{{ it.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
