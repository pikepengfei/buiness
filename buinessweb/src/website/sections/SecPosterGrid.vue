<script setup lang="ts">
/**
 * 图文海报网格区块：区头文案 + 海报条目（配图 / 角标 / 说明 / 跳转）均由管理端编辑，
 * 四宫格版式由 website.css 的 .poster-grid 固定。preview（编辑器内）不渲染链接。
 */
import { computed } from 'vue';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; preview?: boolean }>();

const items = computed<any[]>(() =>
  (Array.isArray(props.p.items) ? props.p.items : []).filter(
    (x: any) => x && (x.image || x.caption || x.tag)
  )
);
const isExternal = (link: string) => /^https?:\/\//i.test(String(link || ''));

function tagOf(it: any) {
  return it.tag || '';
}
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc"
               :more-text="p.moreText" :more-link="p.moreLink" />
      <div v-if="items.length" class="poster-grid">
        <component
          v-for="(it, i) in items"
          :key="i"
          :is="preview ? 'div' : isExternal(it.link) ? 'a' : 'RouterLink'"
          v-bind="preview ? {} : isExternal(it.link) ? { href: it.link, target: '_blank', rel: 'noopener' } : { to: it.link || '/products' }"
          class="poster"
        >
          <img :src="it.image" :alt="it.caption || tagOf(it)" />
          <span v-if="it.tag" class="poster-tag">{{ tagOf(it) }}</span>
          <div v-if="it.caption" class="poster-cap">{{ it.caption }}</div>
        </component>
      </div>
    </div>
  </section>
</template>
