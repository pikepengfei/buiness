<script setup lang="ts">
/**
 * 标题基础元素：眉标 + 多行大标题（<em> 高亮）+ 描述 + 可选「更多」链接
 *
 * DOM 结构与类名沿用原 SecHead，版式仍由 website.css 的 .sec-head 系列决定；
 * 实现从 sections/SecHead.vue 迁入此处，原路径改为薄转发，14 处调用点不改。
 */
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
