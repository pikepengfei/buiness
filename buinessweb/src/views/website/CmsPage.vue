<script setup lang="ts">
/**
 * 一级新增页渲染（A 方案 `/:slug` 软通配的落点）。
 *
 * 刻意不复用 usePageBlocks：那个 composable 会灌入 pageDefaults 兜底内容，
 * 而新增页在「未发布 / 空区块 / 已删除」时必须落品牌化 404，
 * 接口异常则给可重试错误态——两者不能混成「空白或内置兜底」。
 * 固定五个装修页仍走 usePageBlocks，其兜底下线由 D6 单独处理，本组件不改动它们。
 */
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { cms } from '@/api/cms';
import { parseBlocks, type Block } from '@/website/blocks';
import SectionRenderer from '@/website/SectionRenderer.vue';
import NotFound from '@/views/website/NotFound.vue';

type LoadState = 'loading' | 'ok' | 'empty' | 'error';

const route = useRoute();
const state = ref<LoadState>('loading');
const blocks = ref<Block[]>([]);

function applySeo(page: { title?: string | null; meta_title?: string | null; meta_description?: string | null }) {
  const title = page.meta_title || page.title;
  if (title) document.title = String(title);
  if (!page.meta_description) return;
  let el = document.head.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'description');
    document.head.appendChild(el);
  }
  el.setAttribute('content', page.meta_description);
}

async function load(slug: string) {
  state.value = 'loading';
  blocks.value = [];
  try {
    // /public/pages/:slug 只查 status=1，查不到返回 200 + data:null
    const page = await cms.getPage(slug);
    const list = parseBlocks(page?.content_json);
    if (!page || !list.length) {
      state.value = 'empty';
      return;
    }
    blocks.value = list;
    applySeo(page);
    state.value = 'ok';
  } catch {
    state.value = 'error';
  }
}

function retry() {
  void load(String(route.params.slug || ''));
}

onMounted(() => void load(String(route.params.slug || '')));
watch(
  () => route.params.slug,
  (slug) => { if (slug) void load(String(slug)); },
);
</script>

<template>
  <section v-if="state === 'loading'" class="container cms-state">加载中…</section>
  <NotFound v-else-if="state === 'empty'" />
  <section v-else-if="state === 'error'" class="container cms-state">
    <p>页面加载失败，请稍后重试。</p>
    <button class="btn btn-primary" type="button" @click="retry">重新加载</button>
  </section>
  <SectionRenderer v-else :blocks="blocks" />
</template>

<style scoped>
.cms-state {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}
</style>
