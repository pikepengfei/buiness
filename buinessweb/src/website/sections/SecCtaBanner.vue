<script setup lang="ts">
// CTA 横幅区块
import { UiButton, UiText } from '@/components/ui';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <div class="container">
    <div class="cta-banner">
      <div>
        <h3>{{ p.title }}</h3>
        <UiText v-if="p.desc" :text="p.desc" />
      </div>
      <UiButton :text="p.btnText" :to="p.btnLink || '/contact'" variant="ghost-light" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
/* 原 .cta-banner .btn 的层叠关系：卡片 ::before 装饰需要压在按钮之下 */
.cta-banner :deep(.ui-btn) {
  position: relative;
  z-index: 1;
}
</style>
