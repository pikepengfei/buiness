<script setup lang="ts">
/**
 * 产品矩阵区块：区头文案由管理端编辑，分类筛选 / 搜索 / 排序 / 分页为固定结构（公开 API 驱动）。
 * 筛选与分页参数落在地址栏（cat / q / page）：同一地址得同一结果，可直接分享。
 * preview（编辑器内）下仍可筛选翻页，但不跳转产品详情、不写地址栏。
 * 「0 条结果」与「请求失败」是两种表现：前者空态，后者可重试错误态，不合并。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductCategory, ProductSummary } from '@/types/cms';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; preview?: boolean }>();
const route = useRoute();
const router = useRouter();

const categories = ref<ProductCategory[]>([]);
const products = ref<ProductSummary[]>([]);
const loading = ref(true);
const failed = ref(false);
const activeCat = ref('');
const keyword = ref('');
const sort = ref('');
const page = ref(1);
const total = ref(0);

const pageSize = computed(() => Math.min(48, Math.max(1, Number(props.p.pageSize) || 9)));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageList = computed(() => {
  const start = Math.max(1, page.value - 2);
  const end = Math.min(totalPages.value, page.value + 2);
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
});

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const res: any = await cms.getProductsPaged({
      category: activeCat.value || undefined,
      keyword: keyword.value.trim() || undefined,
      sort: sort.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    if (res && res.code === 0 && Array.isArray(res.data)) {
      products.value = res.data;
      total.value = (res.meta && res.meta.total) || res.data.length;
    } else {
      products.value = [];
      total.value = 0;
    }
  } catch {
    // 失败不冒充空列表：给可重试的错误态，避免访客把故障误读成「没有产品」
    failed.value = true;
    products.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 筛选 / 页码写回地址栏（replace 不产生历史记录），preview 下不动编辑器地址 */
function syncQuery() {
  if (props.preview) return;
  const q: Record<string, string> = {};
  if (activeCat.value) q.cat = activeCat.value;
  if (keyword.value.trim()) q.q = keyword.value.trim();
  if (page.value > 1) q.page = String(page.value);
  const cur = route.query;
  const same = Object.keys(q).length === Object.keys(cur).length
    && Object.entries(q).every(([k, v]) => String(cur[k] ?? '') === v);
  if (!same) router.replace({ query: q });
}

watch(pageSize, () => {
  page.value = 1;
  load();
});

function setCat(slug: string) {
  activeCat.value = slug;
  page.value = 1;
  load();
  syncQuery();
}
function onSearch() {
  page.value = 1;
  load();
  syncQuery();
}
function goPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  page.value = p;
  load();
  syncQuery();
  if (props.preview) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openProduct(slug: string) {
  if (props.preview) return;
  router.push(`/product/${slug}`);
}

onMounted(async () => {
  // 从地址栏恢复筛选与页码：直接打开分享链接得到与原访问者相同的结果
  if (!props.preview) {
    const q = route.query;
    if (typeof q.cat === 'string' && q.cat) activeCat.value = q.cat;
    if (typeof q.q === 'string' && q.q) keyword.value = q.q;
    const p = Number(q.page);
    if (Number.isInteger(p) && p > 1) page.value = p;
  }
  try {
    categories.value = await cms.getProductCategories().catch(() => []);
  } catch {
    categories.value = [];
  }
  await load();
});
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />

      <div class="filter-bar">
        <button class="f-btn" :class="{ active: activeCat === '' }" @click="setCat('')">全部产品</button>
        <button
          v-for="c in categories"
          :key="c.id"
          class="f-btn"
          :class="{ active: activeCat === c.slug }"
          @click="setCat(c.slug)"
        >{{ c.name }}</button>
      </div>

      <div class="prod-tools">
        <div class="search-box">
          <input v-model="keyword" type="text" placeholder="搜索产品名称 / 关键词…" @keyup.enter="onSearch" />
          <button class="btn btn-primary" @click="onSearch">搜索</button>
        </div>
        <select v-model="sort" class="sort-select" @change="onSearch">
          <option value="">默认排序</option>
          <option value="price_asc">价格从低到高</option>
          <option value="price_desc">价格从高到低</option>
        </select>
      </div>

      <div v-if="loading" class="sec-loading">加载中…</div>
      <div v-else-if="failed" class="sec-empty">
        <p>产品列表加载失败，请稍后重试。</p>
        <button class="btn btn-primary" @click="load">重新加载</button>
      </div>
      <div v-else-if="products.length === 0" class="sec-empty">没有找到相关产品，换个关键词或分类试试～</div>
      <div v-else class="product-grid">
        <article v-for="pt in products" :key="pt.id" class="product" @click="openProduct(pt.slug)">
          <div class="product-img">
            <img v-if="pt.cover_image" :src="pt.cover_image" :alt="pt.name" loading="lazy" />
          </div>
          <div class="product-body">
            <span v-if="pt.category" class="product-cat">{{ pt.category }}</span>
            <h4>{{ pt.name }}</h4>
            <p>{{ pt.summary || 'Centremix 芯联创高品质存储产品。' }}</p>
            <div class="product-tags" v-if="pt.price_text"><span>{{ pt.price_text }}</span></div>
            <div class="product-foot">
              <span>{{ pt.series || '便捷存储' }}</span>
              <span class="more">查看详情 →</span>
            </div>
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
.product { cursor: pointer; }
/* 无封面不拿内置产品图冒充：CSS 空态占位 */
.product-img:empty { min-height: 180px; background: var(--paper); }
.product-img:empty::after { content: '暂无图片'; display: flex; align-items: center; justify-content: center; height: 100%; color: var(--ink-400); font-size: 13px; }
.sec-empty p { margin: 0 0 12px; }
</style>
