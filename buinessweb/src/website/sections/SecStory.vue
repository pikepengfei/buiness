<script setup lang="ts">
// 深色品牌背景区块：段落 + 数据支柱 + 配图 + 背书卡（可选）+ 品牌墙（可选）
import SecHead from './SecHead.vue';

defineProps<{ p: Record<string, any> }>();
</script>

<template>
  <section class="story">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" single dark />

      <!-- 图文版：段落(+支柱) 与配图并排 -->
      <template v-if="p.paras?.length || p.image">
        <div class="story-grid" :style="{ gridTemplateColumns: p.image ? '1.05fr .95fr' : '1fr' }">
          <div>
            <p v-for="(t, i) in p.paras || []" :key="i" style="color: rgba(255, 255, 255, .72)">{{ t }}</p>
            <div class="story-pillars" v-if="p.pillars?.length">
              <div class="pillar" v-for="(pl, i) in p.pillars" :key="i">
                <span class="en">{{ pl.en }}</span><span class="cn">{{ pl.cn }}</span>
              </div>
            </div>
          </div>
          <div class="story-img" v-if="p.image">
            <img :src="p.image" :alt="p.imageAlt || 'Centremix'" />
          </div>
        </div>
        <div class="backer" v-for="(bk, i) in p.backers || []" :key="'b' + i" :style="i ? 'margin-top: 18px' : undefined">
          <div class="b-logo"><span class="c-arc lg"></span></div>
          <div>
            <div class="b-title">{{ bk.title }}</div>
            <p class="b-desc">{{ bk.desc }}</p>
          </div>
        </div>
      </template>

      <!-- 纯背书卡版（关于我们·品牌背书）：双卡并排 -->
      <div v-else-if="p.backers?.length" class="story-grid" style="grid-template-columns: 1fr 1fr">
        <div class="backer" style="margin-top: 0" v-for="(bk, i) in p.backers" :key="'b' + i">
          <div class="b-logo"><span class="c-arc lg"></span></div>
          <div>
            <div class="b-title">{{ bk.title }}</div>
            <p class="b-desc">{{ bk.desc }}</p>
          </div>
        </div>
      </div>

      <!-- 品牌墙（可选，深色背景内） -->
      <div class="brand-wall" v-if="p.brandWall?.length" style="background: transparent; padding: 0; margin-top: 28px">
        <div class="brand-wall-grid">
          <template v-for="(cell, i) in p.brandWall" :key="i">
            <a v-if="cell.url" class="brand-cell" :href="cell.url" target="_blank" rel="noopener"
               style="background: rgba(255, 255, 255, .05); border-color: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .8)">{{ cell.text }}</a>
            <div v-else class="brand-cell"
                 style="background: rgba(255, 255, 255, .05); border-color: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .8)">{{ cell.text }}</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
