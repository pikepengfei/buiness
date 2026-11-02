<script setup lang="ts">
/**
 * 资讯详情（/article/:slug）
 * 区头与元信息全部取接口下发的真实字段：没有分类就没有分类行，没有作者就不出现分隔符；
 * 浏览计数由进入本页时的一次显式上报累加，读详情本身不计数。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import { useSiteStore } from '@/stores/site';
import type { ArticleDetail } from '@/types/cms';

const route = useRoute();
const router = useRouter();
const site = useSiteStore();

const article = ref<ArticleDetail | null>(null);
const loading = ref(true);
const notFound = ref(false);
const failed = ref(false);

function fmtDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? String(s) : d.toISOString().slice(0, 10);
}

/** 元信息只收存在的项：任一项缺失都不会留下孤立分隔符 */
const metaParts = computed(() => {
  const a = article.value;
  if (!a) return [] as string[];
  const out: string[] = [];
  if (a.author) out.push(a.author);
  if (a.category) out.push(a.category);
  const date = fmtDate(a.published_at);
  if (date) out.push(date);
  if (a.view_count > 0) out.push(`阅读 ${a.view_count}`);
  return out;
});

// 浏览器标题跟随资讯标题；返回列表时由路由 afterEach 复位为列表页标题
function applyTitle(a: ArticleDetail | null) {
  document.title = a ? `${a.title} · ${site.siteName}` : `资讯详情 · ${site.siteName}`;
}

/** 上报失败静默：读报错误不该打断阅读，也不回滚已渲染的正文 */
async function reportView(slug: string) {
  try {
    const r = await cms.reportArticleView(slug);
    if (r.counted && typeof r.view_count === 'number' && article.value && article.value.slug === slug) {
      article.value.view_count = r.view_count;
    }
  } catch { /* 忽略 */ }
}

async function load(slug: string) {
  loading.value = true;
  notFound.value = false;
  failed.value = false;
  article.value = null;
  try {
    const a = await cms.getArticle(slug);
    if (!a) {
      notFound.value = true;
      applyTitle(null);
    } else {
      article.value = a;
      applyTitle(a);
      void reportView(slug);
    }
  } catch {
    failed.value = true;
    applyTitle(null);
  } finally {
    loading.value = false;
  }
}

function openRelated(slug: string) {
  router.push(`/article/${slug}`);
}

onMounted(() => load(String(route.params.slug || '')));
watch(
  () => route.params.slug,
  (slug) => {
    if (slug) load(String(slug));
  }
);
</script>

<template>
  <div>
    <!-- 加载中：先不渲染区头，避免用写死的口号占位 -->
    <section v-if="loading" class="container sec-loading">加载中…</section>

    <!-- 查无此条：与「请求失败」表现不同，不给重试入口 -->
    <section v-else-if="notFound" class="container sec-empty">
      <p>未找到该资讯，它可能已下线或链接有误。</p>
      <router-link to="/news" class="btn btn-primary">返回资讯列表 →</router-link>
    </section>

    <!-- 取数失败：可重试 -->
    <section v-else-if="failed" class="container sec-empty">
      <p>资讯加载失败，请检查网络后重试。</p>
      <button class="btn btn-primary" @click="load(String(route.params.slug || ''))">重试</button>
    </section>

    <template v-else-if="article">
      <section class="page-hero">
        <div class="container">
          <div class="crumb">
            <router-link to="/">首页</router-link> /
            <router-link to="/news">新闻资讯</router-link> /
            <span>{{ article.title }}</span>
          </div>
          <h1>{{ article.title }}</h1>
          <p v-if="article.summary">{{ article.summary }}</p>
        </div>
      </section>

      <section>
        <div class="container">
          <!-- 归属行：分类名缺失时整行不渲染，不落到任何固定字样 -->
          <span v-if="article.category" class="eyebrow">{{ article.category }}</span>
          <div v-if="metaParts.length" class="article-meta">
            <template v-for="(m, i) in metaParts" :key="i">
              <span v-if="i > 0" class="dot">·</span>
              <span>{{ m }}</span>
            </template>
          </div>
          <div v-if="article.tags && article.tags.length" class="article-tags">
            <span v-for="t in article.tags" :key="t" class="tag">{{ t }}</span>
          </div>
          <!-- 后端已做内容净化，可直接渲染富文本 -->
          <div class="article-body" v-html="article.body"></div>

          <div class="article-back">
            <router-link to="/news" class="btn btn-ghost">← 返回资讯列表</router-link>
            <router-link to="/products" class="btn">浏览相关产品</router-link>
          </div>
        </div>
      </section>

      <!-- 相关资讯 -->
      <section v-if="article.related && article.related.length" style="background: var(--paper)">
        <div class="container">
          <div class="sec-head">
            <div>
              <span class="eyebrow">相关资讯 · RELATED</span>
              <h2>更多动态</h2>
            </div>
          </div>
          <div class="insights-grid">
            <article
              v-for="r in article.related"
              :key="r.id"
              class="insight"
              @click="openRelated(r.slug)"
            >
              <span v-if="r.category || (r.tags && r.tags.length)" class="insight-tag">{{ r.category || r.tags[0] }}</span>
              <h4>{{ r.title }}</h4>
              <p>{{ r.summary || '' }}</p>
              <div class="insight-foot">
                <span>{{ fmtDate(r.published_at) }}</span>
                <span class="read">阅读全文 →</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="cta-banner">
          <div>
            <h3>了解更多关于 Centremix 芯联创</h3>
            <p>欢迎来到我们的品牌世界，与我们共同守护每一份珍贵数据。</p>
          </div>
          <router-link to="/contact" class="btn btn-ghost-light">售后服务 →</router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.article-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 6px 0 14px;
  color: var(--ink-500);
  font-size: 13.5px;
}
.article-meta .dot {
  color: var(--ink-400);
}
.article-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 24px;
}
.article-tags .tag {
  font-size: 12px;
  color: var(--ink-500);
  background: var(--paper);
  border: 1px solid var(--line, #eaecef);
  border-radius: 999px;
  padding: 2px 10px;
}
.article-back {
  margin-top: 44px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.sec-loading,
.sec-empty {
  padding: 64px 0;
  text-align: center;
  color: var(--ink-400);
  font-size: 14px;
}
.sec-empty .btn {
  margin-top: 14px;
}
/* 富文本正文样式（作用于 v-html 内容，需要 :deep）
   覆盖范围 = 编辑器能力集合 = 清洗白名单里真会出现的标签，h1 与 align/color 一类不在此列 */
.article-body :deep(h2) {
  font-size: 24px;
  margin: 34px 0 14px;
  color: var(--ink-900);
}
.article-body :deep(h3) {
  font-size: 20px;
  margin: 30px 0 12px;
  color: var(--ink-800);
}
.article-body :deep(h4) {
  font-size: 17px;
  margin: 24px 0 10px;
  color: var(--ink-800);
}
.article-body :deep(p) {
  font-size: 15.5px;
  line-height: 2.05;
  color: var(--ink-600);
  margin: 0 0 18px;
}
.article-body :deep(a) {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 3px;
  word-break: break-all;
}
.article-body :deep(strong),
.article-body :deep(b) {
  color: var(--ink-800);
  font-weight: 600;
}
.article-body :deep(ul),
.article-body :deep(ol) {
  padding-left: 22px;
  margin: 0 0 18px;
  color: var(--ink-600);
  font-size: 15px;
  line-height: 1.9;
}
.article-body :deep(li) {
  margin: 0 0 6px;
}
.article-body :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--r-md);
  margin: 8px 0 18px;
}
.article-body :deep(blockquote) {
  border-left: 3px solid var(--brand);
  background: var(--paper);
  padding: 16px 20px;
  margin: 22px 0;
  color: var(--ink-600);
  font-size: 15px;
  line-height: 1.9;
}
.article-body :deep(pre) {
  background: var(--ink-950, #14161a);
  color: #e6e6e6;
  padding: 16px 18px;
  border-radius: var(--r-md);
  margin: 22px 0;
  overflow: auto;
  font-size: 13.5px;
  line-height: 1.75;
}
/* 行内 code 与代码块内的 code 分别处理，后者已由 pre 的配色接管 */
.article-body :deep(code) {
  background: var(--paper);
  color: var(--brand);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13.5px;
}
.article-body :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}
.article-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--line, #eaecef);
  margin: 30px 0;
}
.insight {
  cursor: pointer;
}
</style>
