<script setup lang="ts">
// 售后服务：整页由 CMS 页面区块（slug=contact）驱动，内置默认内容兜底。
// FAQ 与表单提交数据仍为 API 驱动（faq-list / contact-form 区块内部对接）。
import SectionRenderer from '@/website/SectionRenderer.vue';
import { usePageBlocks } from '@/website/usePageBlocks';

const { blocks } = usePageBlocks('contact');
</script>

<template>
  <SectionRenderer :blocks="blocks" />
</template>
