<script setup lang="ts">
// 精选产品区块：文案可编辑，产品数据来自公开 API（按 sort 取前 N）
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductSummary } from '@/types/cms';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any> }>();
const router = useRouter();
const items = ref<ProductSummary[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const res: any = await cms.getProductsPaged({ page: 1, pageSize: Number(props.p.limit) || 3 });
    items.value = res && res.code === 0 && Array.isArray(res.data) ? res.data : [];
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" :more-text="p.moreText" :more-link="p.moreLink" />
      <div v-if="loading" class="sec-loading">加载中…</div>
      <div v-else-if="items.length === 0" class="sec-empty">暂无产品，敬请期待。</div>
      <div v-else class="product-grid">
        <article v-for="it in items" :key="it.id" class="product" @click="router.push(`/products/${it.slug}`)">
          <div class="product-img">
            <img :src="it.cover_image || '/website/img/prod/cube-closeup.png'" :alt="it.name" />
          </div>
          <div class="product-body">
            <span class="product-cat">{{ it.category || '存储产品' }}</span>
            <h4>{{ it.name }}</h4>
            <p>{{ it.summary || 'Centremix 芯联创高品质存储产品。' }}</p>
            <div class="product-tags" v-if="it.price_text"><span>{{ it.price_text }}</span></div>
            <div class="product-foot">
              <span>{{ it.series || '便捷存储' }}</span>
              <span class="more">查看详情 →</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sec-loading, .sec-empty { padding: 48px 0; text-align: center; color: var(--ink-400); font-size: 14px; }
.product { cursor: pointer; }
</style>
