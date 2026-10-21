<script setup lang="ts">
// 产品中心：整页由 CMS 页面区块（slug=products）驱动，内置默认内容兜底。
// 产品矩阵列表由 product-grid 区块承载（区头文案可编辑，筛选/搜索/分页结构固定）。
import SectionRenderer from '@/website/SectionRenderer.vue';
import { usePageBlocks } from '@/website/usePageBlocks';

const { blocks } = usePageBlocks('products');
</script>

<template>
  <SectionRenderer :blocks="blocks" />
</template>
