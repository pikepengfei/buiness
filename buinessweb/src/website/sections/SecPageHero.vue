<script setup lang="ts">
// 内页头图区块：面包屑 + 多行标题 + 副标题
import { computed } from 'vue';

const props = defineProps<{ p: Record<string, any> }>();
const titleLines = computed(() =>
  Array.isArray(props.p.title) ? props.p.title : [props.p.title || '']
);
</script>

<template>
  <section class="page-hero">
    <div class="container">
      <div class="crumb" v-if="p.crumb?.length">
        <template v-for="(c, i) in p.crumb" :key="i">
          <router-link v-if="c.link" :to="c.link">{{ c.text }}</router-link>
          <span v-else>{{ c.text }}</span>
          <template v-if="Number(i) < Number(p.crumb.length) - 1"> / </template>
        </template>
      </div>
      <h1>
        <template v-for="(l, i) in titleLines" :key="i"><span v-html="l" /><br v-if="i < titleLines.length - 1" /></template>
      </h1>
      <p v-if="p.subtitle">{{ p.subtitle }}</p>
    </div>
  </section>
</template>
