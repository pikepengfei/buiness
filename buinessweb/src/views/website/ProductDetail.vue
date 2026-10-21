<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductDetail } from '@/types/cms';

const route = useRoute();
const router = useRouter();

const product = ref<ProductDetail | null>(null);
const loading = ref(true);
const notFound = ref(false);
const activeImg = ref('');

const gallery = computed<string[]>(() => {
  if (product.value?.gallery?.length) return product.value.gallery;
  if (product.value?.cover_image) return [product.value.cover_image];
  return ['/website/img/prod/cube-closeup.png'];
});

const tags = computed<string[]>(() => {
  const p = product.value;
  if (!p) return [];
  const t: string[] = [];
  if (p.series) t.push(p.series);
  if (p.price_text) t.push(p.price_text);
  if (p.category) t.push(p.category);
  return t;
});

function selectImg(src: string) {
  activeImg.value = src;
}

watch(product, (p) => {
  if (p) activeImg.value = gallery.value[0];
});

async function load(slug: string) {
  loading.value = true;
  notFound.value = false;
  try {
    const p = await cms.getProduct(slug);
    if (!p) {
      notFound.value = true;
      product.value = null;
    } else {
      product.value = p;
      activeImg.value = gallery.value[0];
    }
  } catch {
    notFound.value = true;
    product.value = null;
  } finally {
    loading.value = false;
  }
}

function openRelated(slug: string) {
  router.push(`/products/${slug}`);
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
          <router-link to="/products">产品中心</router-link> /
          <span>产品详情</span>
        </div>
        <h1>产品详情<br>参数与卖点</h1>
        <p>以「便捷存储」为核心，每一款产品都经过严苛筛选，为国人带来兼具高品质与高性价比的存储体验。</p>
      </div>
    </section>

    <!-- 加载中 -->
    <section v-if="loading" class="container sec-loading">加载中…</section>

    <!-- 未找到 -->
    <section v-else-if="notFound" class="container sec-empty">
      <p>未找到该产品的详情，它可能已下架或链接有误。</p>
      <router-link to="/products" class="btn btn-primary">返回产品中心 →</router-link>
    </section>

    <!-- 产品详情 -->
    <template v-else-if="product">
      <section>
        <div class="container">
          <div class="detail-head">
            <div class="dh-img">
              <img :src="activeImg" :alt="product.name" />
            </div>
            <div class="dh-info">
              <span class="eyebrow">{{ product.category || '存储产品' }}</span>
              <h2>{{ product.name }}</h2>
              <p class="dh-desc">{{ product.description || product.summary }}</p>
              <div class="product-tags" v-if="tags.length">
                <span v-for="(t, i) in tags" :key="i">{{ t }}</span>
              </div>
              <div class="dh-cta buy-row">
                <a
                  v-if="product.buy_link"
                  class="btn"
                  :href="product.buy_link"
                  target="_blank"
                  rel="noopener"
                >天猫旗舰店购买 →</a>
                <router-link to="/contact" class="btn btn-ghost">售后保障</router-link>
              </div>
            </div>
          </div>

          <!-- 图集缩略图 -->
          <div v-if="gallery.length > 1" class="gallery-thumbs">
            <button
              v-for="(g, i) in gallery"
              :key="i"
              class="thumb"
              :class="{ active: g === activeImg }"
              @click="selectImg(g)"
            >
              <img :src="g" :alt="product.name" />
            </button>
          </div>

          <!-- 规格参数 -->
          <div class="sec-head" style="margin-top: 56px">
            <div><span class="eyebrow">规格参数 · SPECS</span><h2>核心参数</h2></div>
          </div>
          <table class="spec-table" v-if="product.specs && product.specs.length">
            <colgroup><col style="width: 24%" /><col style="width: 76%" /></colgroup>
            <tbody>
              <tr v-for="(s, i) in product.specs" :key="i">
                <th>{{ s.label }}</th>
                <td>{{ s.value }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="sec-empty">暂无规格参数。</p>

          <!-- 产品卖点 -->
          <div class="sec-head" style="margin-top: 56px">
            <div><span class="eyebrow">产品卖点 · HIGHLIGHTS</span><h2>为什么选择它</h2></div>
          </div>
          <div class="feat-grid" v-if="product.highlights && product.highlights.length">
            <div class="feat" v-for="(h, i) in product.highlights" :key="i">
              <p>{{ h }}</p>
            </div>
          </div>
          <p v-else class="sec-empty">暂无产品卖点说明。</p>
        </div>
      </section>

      <!-- 相关产品 -->
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
                <img :src="r.cover_image || '/website/img/prod/cube-closeup.png'" :alt="r.name" />
              </div>
              <div class="product-body">
                <span class="product-cat">{{ r.category || '存储产品' }}</span>
                <h4>{{ r.name }}</h4>
                <p>{{ r.summary || '' }}</p>
                <div class="product-foot">
                  <span>{{ r.series || '便捷存储' }}</span>
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
.product {
  cursor: pointer;
}
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
