<script setup lang="ts">
// 关于我们：整页由 CMS 页面区块（slug=about）驱动，内置默认内容兜底。
import SectionRenderer from '@/website/SectionRenderer.vue';
import { usePageBlocks } from '@/website/usePageBlocks';

const { blocks } = usePageBlocks('about');
</script>

<template>
  <SectionRenderer :blocks="blocks" />
</template>
