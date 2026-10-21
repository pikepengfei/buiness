<script setup lang="ts">
/**
 * 资讯列表区块：区头文案由管理端编辑，分类筛选与分页为固定结构（公开 API 驱动）。
 * preview（编辑器内）下仍可筛选翻页，但不跳转资讯详情。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ArticleCategory, ArticleSummary } from '@/types/cms';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; preview?: boolean }>();
const router = useRouter();

const categories = ref<ArticleCategory[]>([]);
const articles = ref<ArticleSummary[]>([]);
const loading = ref(true);
const activeCat = ref('');
const page = ref(1);
const total = ref(0);

const pageSize = computed(() => Math.min(48, Math.max(1, Number(props.p.pageSize) || 6)));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageList = computed(() => {
  const start = Math.max(1, page.value - 2);
  const end = Math.min(totalPages.value, page.value + 2);
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
});

function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? String(s) : d.toISOString().slice(0, 10);
}

async function load() {
  loading.value = true;
  try {
    const res: any = await cms.getArticles({
      category: activeCat.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    const payload = res && res.data ? res.data : res;
    if (payload && payload.code === 0 && Array.isArray(payload.data)) {
      articles.value = payload.data;
      total.value = (payload.meta && payload.meta.total) || payload.data.length;
    } else {
      articles.value = [];
      total.value = 0;
    }
  } catch {
    articles.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

watch(pageSize, () => {
  page.value = 1;
  load();
});

function setCat(slug: string) {
  activeCat.value = slug;
  page.value = 1;
  load();
}
function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  page.value = p;
  load();
  if (props.preview) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openArticle(slug: string) {
  if (props.preview) return;
  router.push(`/news/${slug}`);
}

onMounted(async () => {
  try {
    categories.value = await cms.getArticleCategories().catch(() => []);
  } catch {
    categories.value = [];
  }
  await load();
});
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead v-if="p.eyebrow || (p.title && p.title.length) || p.desc"
               :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />

      <div class="filter-bar">
        <button class="f-btn" :class="{ active: activeCat === '' }" @click="setCat('')">全部资讯</button>
        <button
          v-for="c in categories"
          :key="c.id"
          class="f-btn"
          :class="{ active: activeCat === c.slug }"
          @click="setCat(c.slug)"
        >{{ c.name }}</button>
      </div>

      <div v-if="loading" class="sec-loading">加载中…</div>
      <div v-else-if="articles.length === 0" class="sec-empty">暂无资讯，敬请期待。</div>
      <div v-else class="insights-grid">
        <article v-for="a in articles" :key="a.id" class="insight" @click="openArticle(a.slug)">
          <span class="insight-tag">{{ a.category || (a.tags && a.tags[0]) || 'NEWS' }}</span>
          <h4>{{ a.title }}</h4>
          <p>{{ a.summary || '' }}</p>
          <div class="insight-foot">
            <span>{{ fmtDate(a.published_at) }}</span>
            <span class="read">阅读全文 →</span>
          </div>
        </article>
      </div>

      <div v-if="!loading && totalPages > 1" class="pager">
        <button class="pg" :disabled="page === 1" @click="goPage(page - 1)">← 上一页</button>
        <button v-for="n in pageList" :key="n" class="pg" :class="{ active: n === page }" @click="goPage(n)">{{ n }}</button>
        <button class="pg" :disabled="page === totalPages" @click="goPage(page + 1)">下一页 →</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.insight { cursor: pointer; }
</style>
