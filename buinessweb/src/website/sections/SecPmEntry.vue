<script setup lang="ts">
// 产品矩阵入口区块（大号字 + 编号 + 标题 + 按钮）
import { UiButton } from '@/components/ui';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <div class="pm-entry">
        <div class="pm-word">{{ p.word }}</div>
        <div class="pm-num">{{ p.num }}</div>
        <div class="pm-title">{{ p.title }}<br v-if="p.sub" /><span v-if="p.sub">{{ p.sub }}</span></div>
        <div class="pm-desc" v-if="p.desc">{{ p.desc }}</div>
        <UiButton :text="p.btnText" :to="p.btnLink || '/products'" variant="solid" />
      </div>
      <slot />
    </div>
  </section>
</template>
