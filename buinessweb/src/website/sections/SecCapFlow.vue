<script setup lang="ts">
// 产品特性四宫格区块（深色背景）
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();

const darkCell = 'border-color: rgba(255, 255, 255, .1)';
</script>

<template>
  <section class="story">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" single dark />
      <div class="cap-flow" style="background: rgba(255, 255, 255, .04); border-color: rgba(255, 255, 255, .1)">
        <div class="cap" v-for="(it, i) in p.items || []" :key="i" :style="darkCell">
          <div class="cap-step">{{ it.step }}</div>
          <h4 style="color: #fff">{{ it.title }}</h4>
          <p style="color: rgba(255, 255, 255, .7)">{{ it.text }}</p>
          <div class="cap-tags" v-if="it.tags?.length">
            <span v-for="(t, j) in it.tags" :key="j"
                  style="color: rgba(255, 255, 255, .8); border-color: rgba(255, 255, 255, .2)">{{ t }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
