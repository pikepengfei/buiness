<script setup lang="ts">
// 最新资讯区块：文案可编辑，资讯数据来自公开 API（按发布时间取前 N）
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ArticleSummary } from '@/types/cms';
import { DEMO_ARTICLES } from '@/website/libraryDemoData';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; demo?: boolean }>();
const router = useRouter();
const items = ref<ArticleSummary[]>([]);
const loading = ref(true);

onMounted(async () => {
  // 组件库预览：用内置样例渲染，不发内容请求（预览舞台屏蔽交互，点击不会跳转）
  if (props.demo) {
    items.value = DEMO_ARTICLES.slice(0, Number(props.p.limit) || 3);
    loading.value = false;
    return;
  }
  try {
    const res: any = await cms.getArticlesPaged({ page: 1, pageSize: Number(props.p.limit) || 3 });
    items.value = res && res.code === 0 && Array.isArray(res.data) ? res.data : [];
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
});

function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" :more-text="p.moreText" :more-link="p.moreLink" />
      <div v-if="loading" class="sec-loading">加载中…</div>
      <div v-else-if="items.length === 0" class="sec-empty">暂无资讯，敬请期待。</div>
      <div v-else class="insights-grid">
        <article v-for="it in items" :key="it.id" class="insight" @click="router.push(`/article/${it.slug}`)">
          <span v-if="it.category" class="insight-tag">{{ it.category }}</span>
          <h4>{{ it.title }}</h4>
          <p>{{ it.summary || '' }}</p>
          <div class="insight-foot">
            <span>{{ fmtDate(it.published_at) }}</span>
            <span class="read">阅读全文 →</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sec-loading, .sec-empty { padding: 48px 0; text-align: center; color: var(--ink-400); font-size: 14px; }
.insight { cursor: pointer; }
</style>
