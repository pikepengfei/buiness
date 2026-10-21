<script setup lang="ts">
// FAQ 区块：标题文案可编辑，问答数据来自公开 API（可按 category 过滤）
import { onMounted, ref } from 'vue';
import { cms } from '@/api/cms';
import type { Faq } from '@/types/cms';
import SecHead from './SecHead.vue';

const props = defineProps<{ p: Record<string, any> }>();
const faqs = ref<Faq[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    faqs.value = await cms.getFaqs(props.p.category || undefined).catch(() => []);
  } catch {
    faqs.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section :style="p.theme === 'paper' ? { background: 'var(--paper)' } : undefined">
    <div class="container">
      <SecHead :eyebrow="p.eyebrow" :title="p.title" :desc="p.desc" />
      <div v-if="loading" class="sec-loading">加载中…</div>
      <div v-else-if="faqs.length === 0" class="sec-empty">暂无常见问题，可直接通过表单联系我们。</div>
      <div v-else class="insights-grid">
        <div class="insight" v-for="f in faqs" :key="f.id">
          <span class="insight-tag">{{ f.category || '常见问题' }}</span>
          <h4>{{ f.question }}</h4>
          <p>{{ f.answer }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sec-loading, .sec-empty { padding: 48px 0; text-align: center; color: var(--ink-400); font-size: 14px; }
</style>
