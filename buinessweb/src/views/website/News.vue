<script setup lang="ts">
// 新闻咨询：整页由 CMS 页面区块（slug=news）驱动，内置默认内容兜底。
// 资讯列表由 news-feed 区块承载（区头可空，分类筛选/分页结构固定）。
import SectionRenderer from '@/website/SectionRenderer.vue';
import { usePageBlocks } from '@/website/usePageBlocks';

const { blocks } = usePageBlocks('news');
</script>

<template>
  <SectionRenderer :blocks="blocks" />
</template>
