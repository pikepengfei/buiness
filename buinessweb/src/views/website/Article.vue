<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ArticleDetail } from '@/types/cms';

const route = useRoute();
const router = useRouter();

const article = ref<ArticleDetail | null>(null);
const loading = ref(true);
const notFound = ref(false);

async function load(slug: string) {
  loading.value = true;
  notFound.value = false;
  try {
    const a = await cms.getArticle(slug);
    if (!a) {
      notFound.value = true;
      article.value = null;
    } else {
      article.value = a;
    }
  } catch {
    notFound.value = true;
    article.value = null;
  } finally {
    loading.value = false;
  }
}

function openRelated(slug: string) {
  router.push(`/news/${slug}`);
}

onMounted(() => load(route.params.slug as string));
watch(
  () => route.params.slug,
  (slug) => {
    if (slug) load(slug as string);
  }
);
</script>

<template>
  <div>
    <section class="page-hero">
      <div class="container">
        <div class="crumb">
          <router-link to="/">首页</router-link> /
          <router-link to="/news">新闻咨询</router-link> /
          <span>资讯详情</span>
        </div>
        <h1>新闻咨询<br>详情</h1>
        <p>品牌动态 · 产品洞察 · 存储趋势，与你分享 Centremix 芯联创的每一次新进展。</p>
      </div>
    </section>

    <!-- 加载中 -->
    <section v-if="loading" class="container sec-loading">加载中…</section>

    <!-- 未找到 -->
    <section v-else-if="notFound" class="container sec-empty">
      <p>未找到该资讯，它可能已下架或链接有误。</p>
      <router-link to="/news" class="btn btn-primary">返回资讯列表 →</router-link>
    </section>

    <!-- 文章正文 -->
    <template v-else-if="article">
      <section>
        <div class="container article-wrap">
          <span class="eyebrow">{{ article.category || (article.tags && article.tags[0]) || 'NEWS' }}</span>
          <h2 class="article-title">{{ article.title }}</h2>
          <div class="article-meta">
            <span v-if="article.author">{{ article.author }}</span>
            <span v-if="article.author && article.category">·</span>
            <span v-if="article.category">{{ article.category }}</span>
            <span v-if="(article.author || article.category) && article.published_at">·</span>
            <span v-if="article.published_at">{{ article.published_at }}</span>
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
              <span class="insight-tag">{{ r.category || (r.tags && r.tags[0]) || 'NEWS' }}</span>
              <h4>{{ r.title }}</h4>
              <p>{{ r.summary || '' }}</p>
              <div class="insight-foot">
                <span>{{ r.published_at }}</span>
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
.article-wrap {
  max-width: 860px;
}
.article-title {
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.3;
  margin: 12px 0 14px;
  color: var(--ink-950);
}
.article-meta {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  margin: 6px 0 26px;
  color: var(--ink-500);
  font-size: 13.5px;
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
/* 富文本正文样式（作用于 v-html 内容，需要 :deep） */
.article-body :deep(p) {
  font-size: 15.5px;
  line-height: 2.05;
  color: var(--ink-600);
  margin: 0 0 18px;
}
.article-body :deep(h3) {
  font-size: 20px;
  margin: 30px 0 12px;
  color: var(--ink-800);
}
.article-body :deep(ul),
.article-body :deep(ol) {
  padding-left: 22px;
  margin: 0 0 18px;
  color: var(--ink-600);
  font-size: 15px;
  line-height: 1.9;
}
.article-body :deep(img) {
  max-width: 100%;
  border-radius: var(--r-md);
  margin: 8px 0 18px;
}
.article-body :deep(blockquote),
.article-body :deep(.article-quote) {
  border-left: 3px solid var(--brand);
  background: var(--paper);
  padding: 16px 20px;
  margin: 22px 0;
  color: var(--ink-600);
  font-size: 15px;
  line-height: 1.9;
}
.insight {
  cursor: pointer;
}
</style>
