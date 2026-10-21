<script setup lang="ts">
// CTA 横幅区块
defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <div class="container">
    <div class="cta-banner">
      <div>
        <h3>{{ p.title }}</h3>
        <p v-if="p.desc">{{ p.desc }}</p>
      </div>
      <router-link :to="p.btnLink || '/contact'" class="btn btn-ghost-light">{{ p.btnText }}</router-link>
    </div>
  </div>
</template>
