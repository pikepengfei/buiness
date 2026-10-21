<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductSummary, ArticleSummary } from '@/types/cms';

const router = useRouter();

const keyword = ref('');
const loading = ref(false);
const searched = ref(false);
const products = ref<ProductSummary[]>([]);
const articles = ref<ArticleSummary[]>([]);

const hotTags = ['小方块', 'CB500', 'DDR4', 'DDR5', '质保', '易存宝'];

async function doSearch(kw?: string) {
  const q = (kw ?? keyword.value).trim();
  if (kw !== undefined) keyword.value = q;
  if (!q) {
    searched.value = true;
    products.value = [];
    articles.value = [];
    return;
  }
  loading.value = true;
  searched.value = true;
  try {
    const r = await cms.search(q);
    products.value = Array.isArray(r.products) ? r.products : [];
    articles.value = Array.isArray(r.articles) ? r.articles : [];
  } catch {
    products.value = [];
    articles.value = [];
  } finally {
    loading.value = false;
  }
}

function onEnter(e: KeyboardEvent) {
  if (e.key === 'Enter') doSearch();
}

function goProduct(slug: string) {
  router.push(`/products/${slug}`);
}
function goArticle(slug: string) {
  router.push(`/news/${slug}`);
}
</script>

<template>
  <div>
    <section class="page-hero">
      <div class="container">
        <div class="crumb"><router-link to="/">首页</router-link> / <span>站内搜索</span></div>
        <h1>搜索<br>产品与资讯</h1>
        <p>输入关键词，查找 Centremix 芯联创的产品、规格与品牌动态。</p>
      </div>
    </section>

    <section>
      <div class="container search-wrap">
        <div class="search-box">
          <input
            v-model="keyword"
            type="text"
            placeholder="搜索产品 / 资讯，如：小方块、DDR5、质保…"
            autocomplete="off"
            @keyup="onEnter"
          />
          <button class="btn btn-primary" @click="doSearch()">搜索</button>
        </div>
        <p class="search-hint" v-if="!searched">试试搜索：小方块 CB500、炫影 DDR4、永燃星 DDR5、质保、易存宝</p>
        <div class="s-hot" v-if="!searched">
          <span v-for="t in hotTags" :key="t" @click="doSearch(t)">{{ t }}</span>
        </div>

        <div v-if="loading" class="sec-loading">搜索中…</div>

        <div v-else-if="searched && !products.length && !articles.length" class="s-empty">
          没有找到与「{{ keyword }}」相关的内容，换个关键词试试～
        </div>

        <div v-else>
          <div class="s-group" v-if="products.length">
            <h3>产品 · Products</h3>
            <div
              class="s-item"
              v-for="p in products"
              :key="'p' + p.id"
              @click="goProduct(p.slug)"
            >
              <img :src="p.cover_image || '/website/img/prod/cube-closeup.png'" :alt="p.name" />
              <div class="si-body">
                <h4>{{ p.name }}</h4>
                <p>{{ p.summary || '' }}</p>
              </div>
              <span class="si-tag">{{ p.category || '存储产品' }}</span>
            </div>
          </div>

          <div class="s-group" v-if="articles.length">
            <h3>资讯 · News</h3>
            <div
              class="s-item"
              v-for="a in articles"
              :key="'a' + a.id"
              @click="goArticle(a.slug)"
            >
              <div class="si-body">
                <h4>{{ a.title }}</h4>
                <p>{{ a.summary || '' }}</p>
              </div>
              <span class="si-tag">{{ a.category || (a.tags && a.tags[0]) || 'NEWS' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.search-wrap {
  max-width: 760px;
  margin: 0 auto;
}
.search-box {
  display: flex;
  gap: 12px;
  margin: 0 0 10px;
}
.search-box input {
  flex: 1;
  border: 1px solid var(--ink-100);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 15px;
  outline: none;
  font-family: inherit;
  background: var(--ink-50);
  transition: border-color 0.2s;
}
.search-box input:focus {
  border-color: var(--brand);
  background: #fff;
}
.search-hint {
  font-size: 13px;
  color: var(--ink-500);
  margin: 0 0 30px;
}
.s-hot {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.s-hot span {
  border: 1px solid var(--ink-100);
  background: #fff;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.s-hot span:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.s-group {
  margin: 0 0 36px;
}
.s-group h3 {
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--ink-400);
  text-transform: uppercase;
  margin: 0 0 14px;
  font-weight: 600;
}
.s-item {
  display: flex;
  gap: 16px;
  align-items: center;
  border: 1px solid var(--ink-100);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s;
}
.s-item:hover {
  border-color: var(--brand);
}
.s-item img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 10px;
  background: var(--paper);
  flex: none;
}
.s-item .si-body {
  flex: 1;
  min-width: 0;
}
.s-item h4 {
  margin: 0 0 4px;
  font-size: 15.5px;
}
.s-item p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-500);
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.s-item .si-tag {
  font-size: 12px;
  color: var(--brand);
  border: 1px solid var(--brand);
  border-radius: 999px;
  padding: 2px 10px;
  flex: none;
}
.s-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--ink-400);
  font-size: 14px;
}
.sec-loading {
  text-align: center;
  padding: 48px 0;
  color: var(--ink-400);
  font-size: 14px;
}
</style>
