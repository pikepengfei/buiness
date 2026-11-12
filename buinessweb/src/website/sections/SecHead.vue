<script setup lang="ts">
/**
 * 区块小标题（薄转发）
 *
 * 实现已迁至公共基础元素 UiHeading，本路径保留给既有 14 处调用点，避免一次性改动全部区块。
 */
import UiHeading from '@/components/ui/UiHeading.vue';

defineProps<{
  eyebrow?: string;
  title?: string | string[];
  desc?: string;
  moreText?: string;
  moreLink?: string;
  dark?: boolean;
  single?: boolean;
}>();
</script>

<template>
  <UiHeading
    :eyebrow="eyebrow"
    :title="title"
    :desc="desc"
    :more-text="moreText"
    :more-link="moreLink"
    :dark="dark"
    :single="single"
  />
</template>
