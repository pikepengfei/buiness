<script setup lang="ts">
/**
 * 资讯列表区块：区头文案由管理端编辑，分类筛选与分页为固定结构（公开 API 驱动）。
 * preview（编辑器内）下仍可筛选翻页，但不跳转资讯详情、不写地址栏。
 * 取数三态分开：加载中 / 空态（没有命中）/ 错误态（可重试），空态不渲染 404、错误态不显示示例数据。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ArticleCategory, ArticleSummary } from '@/types/cms';
import { DEMO_ARTICLES, DEMO_ARTICLE_CATEGORIES } from '@/website/libraryDemoData';
import { UiButton } from '@/components/ui';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; preview?: boolean; demo?: boolean }>();
const route = useRoute();
const router = useRouter();

const categories = ref<ArticleCategory[]>([]);
const articles = ref<ArticleSummary[]>([]);
const loading = ref(true);
const failed = ref(false);
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
  // 组件库预览：内置样例直接填列表，不发内容请求（分类同理在 onMounted 里给样例）
  if (props.demo) {
    articles.value = DEMO_ARTICLES.slice(0, pageSize.value);
    total.value = articles.value.length;
    loading.value = false;
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    const res: any = await cms.getArticlesPaged({
      category: activeCat.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    if (res && res.code === 0 && Array.isArray(res.data)) {
      articles.value = res.data;
      total.value = (res.meta && res.meta.total) || res.data.length;
    } else {
      articles.value = [];
      total.value = 0;
      failed.value = true;
    }
  } catch {
    articles.value = [];
    total.value = 0;
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

// 筛选与分页落地址栏，参数名与公开接口一致（category / page），分享或刷新都回到同一结果
function syncUrl() {
  if (props.preview) return;
  const query: Record<string, string> = {};
  if (activeCat.value) query.category = activeCat.value;
  if (page.value > 1) query.page = String(page.value);
  router.replace({ query });
}

watch(pageSize, () => {
  page.value = 1;
  load();
  syncUrl();
});

function setCat(slug: string) {
  activeCat.value = slug;
  page.value = 1;
  load();
  syncUrl();
}
function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  page.value = p;
  load();
  syncUrl();
  if (props.preview) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openArticle(slug: string) {
  if (props.preview) return;
  router.push(`/article/${slug}`);
}

onMounted(async () => {
  if (props.demo) {
    categories.value = DEMO_ARTICLE_CATEGORIES;
    await load();
    return;
  }
  // 首屏读地址栏：直接打开 /news?category=brand&page=2 应当落到该分类第 2 页
  const qc = typeof route.query.category === 'string' ? route.query.category : '';
  const qp = Number(route.query.page);
  if (qc) activeCat.value = qc;
  if (Number.isFinite(qp) && qp > 1) page.value = Math.floor(qp);
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

      <!-- 取数失败：给出重试入口，不回落成写死的示例资讯 -->
      <div v-else-if="failed" class="sec-empty">
        <p>资讯加载失败，请稍后重试。</p>
        <button class="f-btn" @click="load">重试</button>
      </div>

      <div v-else-if="articles.length === 0" class="sec-empty">
        <p>暂无资讯，敬请期待。</p>
        <UiButton v-if="!preview" text="返回首页 →" to="/" variant="ghost" />
      </div>

      <div v-else class="insights-grid">
        <article v-for="a in articles" :key="a.id" class="insight" @click="openArticle(a.slug)">
          <!-- 归属行取该条自身的分类名，没有分类时退到标签，两者都没有就不渲染这一行 -->
          <span v-if="a.category || (a.tags && a.tags.length)" class="insight-tag">{{ a.category || a.tags[0] }}</span>
          <h4>{{ a.title }}</h4>
          <p>{{ a.summary || '' }}</p>
          <div class="insight-foot">
            <span>{{ fmtDate(a.published_at) }}</span>
            <span class="read">阅读全文 →</span>
          </div>
        </article>
      </div>

      <div v-if="!loading && !failed && totalPages > 1" class="pager">
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
