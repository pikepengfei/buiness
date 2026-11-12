<script setup lang="ts">
// 精选产品区块：文案可编辑，产品数据来自公开 API（按 sort 取前 N）
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cms } from '@/api/cms';
import type { ProductSummary } from '@/types/cms';
import { DEMO_PRODUCTS } from '@/website/libraryDemoData';
import { UiImage } from '@/components/ui';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any>; demo?: boolean }>();
const router = useRouter();
const items = ref<ProductSummary[]>([]);
const loading = ref(true);

onMounted(async () => {
  // 组件库预览：用内置样例渲染，不发内容请求（预览舞台屏蔽交互，点击不会跳转）
  if (props.demo) {
    items.value = DEMO_PRODUCTS.slice(0, Number(props.p.limit) || 3);
    loading.value = false;
    return;
  }
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
        <article v-for="it in items" :key="it.id" class="product" @click="router.push(`/product/${it.slug}`)">
          <div class="product-img">
            <UiImage v-if="it.cover_image" :src="it.cover_image" :alt="it.name" lazy />
          </div>
          <div class="product-body">
            <span v-if="it.category" class="product-cat">{{ it.category }}</span>
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
/* 无封面不拿内置产品图冒充：CSS 空态占位 */
.product-img:empty { min-height: 180px; background: var(--paper); }
.product-img:empty::after { content: '暂无图片'; display: flex; align-items: center; justify-content: center; height: 100%; color: var(--ink-400); font-size: 13px; }
</style>
