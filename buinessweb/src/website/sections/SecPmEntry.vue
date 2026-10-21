<script setup lang="ts">
// 产品矩阵入口区块（大号字 + 编号 + 标题 + 按钮）
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
        <router-link :to="p.btnLink || '/products'" class="btn btn-primary">{{ p.btnText }}</router-link>
      </div>
    </div>
  </section>
</template>
