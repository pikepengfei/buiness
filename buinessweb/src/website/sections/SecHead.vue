<script setup lang="ts">
// 区块通用小标题：eyebrow + 多行大标题 + 描述 + 可选更多链接
import { computed } from 'vue';

const props = defineProps<{
  eyebrow?: string;
  title?: string | string[];
  desc?: string;
  moreText?: string;
  moreLink?: string;
  dark?: boolean;
  single?: boolean;
}>();

const lines = computed(() =>
  Array.isArray(props.title) ? props.title : props.title ? [props.title] : []
);
</script>

<template>
  <div class="sec-head" :style="single ? { gridTemplateColumns: '1fr' } : undefined">
    <div>
      <span class="eyebrow" v-if="eyebrow">{{ eyebrow }}</span>
      <h2 :style="dark ? { color: '#fff' } : undefined">
        <template v-for="(l, i) in lines" :key="i"><span v-html="l" /><br v-if="i < lines.length - 1" /></template>
      </h2>
    </div>
    <p v-if="desc" :style="dark ? { color: 'rgba(255,255,255,.6)' } : undefined">{{ desc }}</p>
    <router-link v-if="moreText && moreLink" :to="moreLink" class="sec-link">{{ moreText }}</router-link>
  </div>
</template>
