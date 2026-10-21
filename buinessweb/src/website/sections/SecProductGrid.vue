<script setup lang="ts">
/**
 * 产品矩阵区块：区头文案由管理端编辑，分类筛选 / 搜索 / 排序 / 分页为固定结构（公开 API 驱动）。
 * preview（编辑器内）下仍可筛选翻页，但不跳转产品详情。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductCategory, ProductSummary } from '@/types/cms';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; preview?: boolean }>();
const router = useRouter();

const categories = ref<ProductCategory[]>([]);
const products = ref<ProductSummary[]>([]);
const loading = ref(true);
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
    products.value = [];
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
function onSearch() {
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
function openProduct(slug: string) {
  if (props.preview) return;
  router.push(`/products/${slug}`);
}

onMounted(async () => {
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
      <div v-else-if="products.length === 0" class="sec-empty">没有找到相关产品，换个关键词或分类试试～</div>
      <div v-else class="product-grid">
        <article v-for="pt in products" :key="pt.id" class="product" @click="openProduct(pt.slug)">
          <div class="product-img">
            <img :src="pt.cover_image || '/website/img/prod/cube-closeup.png'" :alt="pt.name" />
          </div>
          <div class="product-body">
            <span class="product-cat">{{ pt.category || '存储产品' }}</span>
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
</style>
