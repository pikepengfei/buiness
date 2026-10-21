<script setup lang="ts">
// 首页首屏 Hero 区块
import { computed } from 'vue';

const props = defineProps<{ p: Record<string, any> }>();
const titleLines = computed(() =>
  Array.isArray(props.p.title) ? props.p.title : [props.p.title || '']
);
</script>

<template>
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="hero-eyebrow"><span class="c-arc thin"></span> {{ p.eyebrow }}</span>
        <h1>
          <template v-for="(l, i) in titleLines" :key="i"><span v-html="l" /><br v-if="i < titleLines.length - 1" /></template>
        </h1>
        <p class="lede">{{ p.lede }}</p>
        <div class="hero-cta">
          <router-link v-if="p.cta1?.text" :to="p.cta1.link || '/products'" class="btn btn-primary">{{ p.cta1.text }}</router-link>
          <router-link v-if="p.cta2?.text" :to="p.cta2.link || '/products'" class="btn btn-ghost">{{ p.cta2.text }}</router-link>
        </div>
        <div class="hero-meta" v-if="p.meta?.length">
          <div v-for="(m, i) in p.meta" :key="i">{{ m.label }}<b>{{ m.value }}</b></div>
        </div>
      </div>
      <div class="hero-visual">
        <img :src="p.image" :alt="p.imageAlt || 'Centremix 存储产品场景'" />
        <div class="hero-floater l" v-if="p.floaterLeft?.title">
          <span class="c-arc thin" style="border-color: var(--brand)"></span>
          <div><b>{{ p.floaterLeft.title }}</b><br>{{ p.floaterLeft.en }}</div>
        </div>
        <div class="hero-floater r" v-if="p.floaterRight?.title">
          <span class="dot"></span>
          <div><b>{{ p.floaterRight.title }}</b><br>{{ p.floaterRight.en }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
