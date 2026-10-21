<script setup lang="ts">
// 首页：整页由 CMS 页面区块（slug=home）驱动，内置默认内容兜底；
// home 位 Banner 存在时覆盖 hero 区块配图（保留原运营口子）。
import { onMounted, watch } from 'vue';
import { cms } from '@/api/cms';
import type { Banner } from '@/types/cms';
import SectionRenderer from '@/website/SectionRenderer.vue';
import { usePageBlocks } from '@/website/usePageBlocks';

const { blocks, loaded } = usePageBlocks('home');
const banners: Banner[] = [];

function applyBanner() {
  if (!banners.length) return;
  const hero = blocks.value.find((b) => b.type === 'hero');
  if (hero) hero.props.image = banners[0].image_url;
}

onMounted(async () => {
  try {
    const res = await cms.getBanners('home').catch(() => []);
    if (Array.isArray(res)) banners.push(...res);
  } catch {
    // Banner 获取失败不影响页面渲染
  }
  applyBanner();
});

// 远程区块到达晚于 Banner 时重新套用，避免被覆盖丢失
watch(loaded, applyBanner);
</script>

<template>
  <SectionRenderer :blocks="blocks" />
</template>
