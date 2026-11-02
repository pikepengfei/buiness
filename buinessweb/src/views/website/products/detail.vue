<script setup lang="ts">
/**
 * 产品详情页（/product/:slug，/products/:slug 过渡期同指本组件）
 *
 * 页面全部可见信息来自该产品自身：名称、系列、分类、描述、规格、卖点、价格、购买入口、图集与封面。
 * 「无数据即不渲染」：缺哪项就隐藏哪个区块，不用内置占位图或写死文案冒充内容。
 * 查无此条（品牌化 404，不泄漏任何字段）与取数失败（可重试错误态）是两种表现，不合并。
 * 描述是服务端清洗过的 HTML，直接 v-html；草稿与已下架产品在这里只能是 404（公开接口只查上架表）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductDetail } from '@/types/cms';

const route = useRoute();
const router = useRouter();

const product = ref<ProductDetail | null>(null);
const loading = ref(true);
const notFound = ref(false);
const failed = ref(false);
const activeImg = ref('');

/** 无图集只用封面；两者都无则给 CSS 空态（不拿内置产品图冒充真实内容） */
const gallery = computed<string[]>(() => {
  if (product.value?.gallery?.length) return product.value.gallery;
  if (product.value?.cover_image) return [product.value.cover_image];
  return [];
});
const hasImage = computed(() => gallery.value.length > 0);

const tags = computed<string[]>(() => {
  const p = product.value;
  if (!p) return [];
  const t: string[] = [];
  if (p.series) t.push(p.series);
  if (p.price_text) t.push(p.price_text);
  if (p.category) t.push(p.category);
  return t;
});

/** 描述区按清洗后的富文本渲染；摘要只进头图区，两处不重复整段正文 */
const hasDescription = computed(() => {
  const d = product.value?.description || '';
  return d.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|\s/gi, '').length > 0;
});

function selectImg(src: string) {
  activeImg.value = src;
}

watch(product, (p) => {
  if (p) activeImg.value = gallery.value[0] || '';
});

function resetTitle() {
  document.title = '产品详情 · Centremix 芯联创';
}

async function load(slug: string) {
  loading.value = true;
  notFound.value = false;
  failed.value = false;
  try {
    const p = await cms.getProduct(slug);
    if (!p) {
      // 查无此条：可能是已下架 / 草稿 / 标识有误，页面不泄漏该产品的任何字段
      notFound.value = true;
      product.value = null;
      resetTitle();
    } else {
      product.value = p;
      activeImg.value = (p.gallery?.length ? p.gallery : (p.cover_image ? [p.cover_image] : []))[0] || '';
      document.title = `${p.name} · Centremix 芯联创`;
    }
  } catch {
    // 取数失败 ≠ 查无此条：给可重试的错误态，访客能区分「链接错了」与「服务故障」
    failed.value = true;
    product.value = null;
    resetTitle();
  } finally {
    loading.value = false;
  }
}

function openRelated(slug: string) {
  router.push(`/product/${slug}`);
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
    <!-- 加载中 -->
    <section v-if="loading" class="container sec-loading">加载中…</section>

    <!-- 取数失败：可重试错误态（与查无此条分开） -->
    <section v-else-if="failed" class="container sec-empty">
      <p>产品详情加载失败，请稍后重试。</p>
      <button class="btn btn-primary" @click="load(route.params.slug as string)">重新加载</button>
    </section>

    <!-- 查无此条：品牌化 404，不渲染该产品任何字段 -->
    <section v-else-if="notFound" class="container sec-empty">
      <p>未找到该产品，它可能已下架或链接有误。</p>
      <router-link to="/products" class="btn btn-primary">返回产品中心 →</router-link>
    </section>

    <!-- 产品详情：全部区块由内容自身驱动 -->
    <template v-else-if="product">
      <section class="page-hero">
        <div class="container">
          <div class="crumb">
            <router-link to="/">首页</router-link> /
            <router-link to="/products">产品中心</router-link> /
            <span>{{ product.name }}</span>
          </div>
          <h1>{{ product.name }}</h1>
          <!-- 系列与分类来自详情接口下发的真实字段，null 时整块不渲染 -->
          <p v-if="product.series || product.category" class="hero-sub">
            <span v-if="product.series">{{ product.series }}</span>
            <span v-if="product.series && product.category"> · </span>
            <span v-if="product.category">{{ product.category }}</span>
          </p>
        </div>
      </section>

      <section>
        <div class="container">
          <div class="detail-head">
            <div class="dh-img" :class="{ 'dh-img--empty': !hasImage }">
              <img v-if="activeImg" :src="activeImg" :alt="product.name" />
            </div>
            <div class="dh-info">
              <span v-if="product.category" class="eyebrow">{{ product.category }}</span>
              <h2>{{ product.name }}</h2>
              <p v-if="product.summary" class="dh-desc">{{ product.summary }}</p>
              <div class="product-tags" v-if="tags.length">
                <span v-for="(t, i) in tags" :key="i">{{ t }}</span>
              </div>
              <div class="dh-cta buy-row">
                <a
                  v-if="product.buy_link"
                  class="btn"
                  :href="product.buy_link"
                  target="_blank"
                  rel="noopener noreferrer"
                >前往购买 →</a>
                <router-link to="/contact" class="btn btn-ghost">咨询选型</router-link>
              </div>
            </div>
          </div>

          <!-- 图集缩略图：只有 1 张（或仅封面）时不渲染 -->
          <div v-if="gallery.length > 1" class="gallery-thumbs">
            <button
              v-for="(g, i) in gallery"
              :key="i"
              class="thumb"
              :class="{ active: g === activeImg }"
              @click="selectImg(g)"
            >
              <img :src="g" :alt="`${product.name} 图 ${i + 1}`" loading="lazy" />
            </button>
          </div>

          <!-- 详细描述：服务端清洗后的富文本 -->
          <template v-if="hasDescription">
            <div class="sec-head" style="margin-top: 56px">
              <div><span class="eyebrow">产品描述 · DESCRIPTION</span><h2>产品描述</h2></div>
            </div>
            <div class="rich-desc" v-html="product.description"></div>
          </template>

          <!-- 规格参数：无数据不渲染 -->
          <template v-if="product.specs && product.specs.length">
            <div class="sec-head" style="margin-top: 56px">
              <div><span class="eyebrow">规格参数 · SPECS</span><h2>核心参数</h2></div>
            </div>
            <table class="spec-table">
              <colgroup><col style="width: 24%" /><col style="width: 76%" /></colgroup>
              <tbody>
                <tr v-for="(s, i) in product.specs" :key="i">
                  <th>{{ s.label }}</th>
                  <td>{{ s.value }}</td>
                </tr>
              </tbody>
            </table>
          </template>

          <!-- 产品卖点：无数据不渲染 -->
          <template v-if="product.highlights && product.highlights.length">
            <div class="sec-head" style="margin-top: 56px">
              <div><span class="eyebrow">产品卖点 · HIGHLIGHTS</span><h2>为什么选择它</h2></div>
            </div>
            <div class="feat-grid">
              <div class="feat" v-for="(h, i) in product.highlights" :key="i">
                <p>{{ h }}</p>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- 相关产品：无同类产品不渲染该分区 -->
      <section v-if="product.related && product.related.length" style="background: var(--paper)">
        <div class="container">
          <div class="sec-head">
            <div>
              <span class="eyebrow">相关产品 · RELATED</span>
              <h2>你可能也喜欢</h2>
            </div>
          </div>
          <div class="product-grid">
            <article
              v-for="r in product.related"
              :key="r.id"
              class="product"
              @click="openRelated(r.slug)"
            >
              <div class="product-img">
                <img v-if="r.cover_image" :src="r.cover_image" :alt="r.name" loading="lazy" />
              </div>
              <div class="product-body">
                <span v-if="r.category" class="product-cat">{{ r.category }}</span>
                <h4>{{ r.name }}</h4>
                <p v-if="r.summary">{{ r.summary }}</p>
                <div class="product-foot">
                  <span v-if="r.series">{{ r.series }}</span>
                  <span class="more">查看详情 →</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="cta-banner">
          <div>
            <h3>不确定选哪款产品？</h3>
            <p>联系 Centremix 团队，获取 1 对 1 的选型建议与采购报价。</p>
          </div>
          <router-link to="/contact" class="btn btn-ghost-light">获取建议 →</router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hero-sub {
  margin-top: 10px;
  font-size: 15px;
  color: var(--ink-600, #5b6470);
}
.detail-head {
  display: flex;
  gap: 40px;
  align-items: flex-start;
  margin-bottom: 24px;
}
.detail-head .dh-img {
  flex: 0 0 420px;
  max-width: 420px;
  border-radius: 18px;
  overflow: hidden;
  background: var(--paper);
}
/* 无任何图片时的 CSS 空态：一块留白区，不是某张真实产品图 */
.detail-head .dh-img--empty {
  aspect-ratio: 21 / 14;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--ink-100, #e3e6ea);
}
.detail-head .dh-img--empty::after {
  content: '暂无图片';
  color: var(--ink-400, #9aa2ad);
  font-size: 13px;
}
.detail-head .dh-img img {
  width: 100%;
  display: block;
}
.detail-head .dh-info {
  flex: 1;
}
.detail-head h2 {
  font-size: clamp(24px, 3vw, 38px);
  line-height: 1.25;
  margin: 10px 0 14px;
}
.detail-head .dh-desc {
  color: var(--ink-600);
  font-size: 15px;
  line-height: 1.9;
  margin: 0 0 20px;
}
.dh-cta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 22px;
}
.buy-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.gallery-thumbs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 8px 0 0;
}
.gallery-thumbs .thumb {
  width: 84px;
  height: 84px;
  border: 1px solid var(--ink-100);
  border-radius: 12px;
  overflow: hidden;
  padding: 6px;
  background: var(--paper);
  cursor: pointer;
  transition: all 0.2s;
}
.gallery-thumbs .thumb.active {
  border-color: var(--brand);
}
.gallery-thumbs .thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
/* 清洗后的富文本：只保留白名单标签的排版，图片不超容器 */
.rich-desc {
  max-width: 860px;
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink-600);
}
.rich-desc :deep(h2) { font-size: 20px; margin: 18px 0 8px; color: var(--ink-800, #23282f); }
.rich-desc :deep(h3) { font-size: 17px; margin: 16px 0 6px; color: var(--ink-800, #23282f); }
.rich-desc :deep(h4) { font-size: 15px; margin: 14px 0 6px; color: var(--ink-800, #23282f); }
.rich-desc :deep(p) { margin: 0 0 10px; }
.rich-desc :deep(ul), .rich-desc :deep(ol) { padding-left: 22px; margin: 0 0 10px; }
.rich-desc :deep(img) { max-width: 100%; height: auto; display: block; margin: 10px 0; border-radius: 10px; }
.rich-desc :deep(a) { color: var(--brand); }
.spec-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
}
.spec-table th,
.spec-table td {
  border: 1px solid var(--ink-100);
  padding: 12px 14px;
  text-align: left;
  vertical-align: top;
}
.spec-table th {
  width: 24%;
  background: var(--paper);
  font-weight: 600;
  color: var(--ink-800);
}
.spec-table td {
  color: var(--ink-600);
}
.feat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 8px;
}
.feat {
  border: 1px solid var(--ink-100);
  border-radius: 14px;
  padding: 22px 20px;
  background: #fff;
}
.feat p {
  margin: 0;
  font-size: 13.5px;
  color: var(--ink-600);
  line-height: 1.8;
}
.sec-loading,
.sec-empty {
  padding: 64px 0;
  text-align: center;
  color: var(--ink-400);
  font-size: 14px;
}
.sec-empty p {
  margin: 0 0 16px;
}
.product {
  cursor: pointer;
}
.product-img:empty { min-height: 180px; background: var(--paper); }
.product-img:empty::after { content: '暂无图片'; display: flex; align-items: center; justify-content: center; height: 100%; color: var(--ink-400); font-size: 13px; }
@media (max-width: 900px) {
  .detail-head {
    flex-direction: column;
    gap: 24px;
  }
  .detail-head .dh-img {
    flex: none;
    max-width: 100%;
  }
  .feat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
