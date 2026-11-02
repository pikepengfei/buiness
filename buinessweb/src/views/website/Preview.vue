<script setup lang="ts">
/**
 * 草稿预览页（落地建议 P1 增强）：在官网真实布局（WebsiteLayout 提供导航/页脚）下渲染
 * 某页面的「草稿」内容，供运营发布前确认效果。仅登录运营可见（路由 meta.requiresAuth）。
 * 数据来源：GET /pages/by-slug/:slug 的 draft_json（无草稿则回退线上 content_json）。
 */
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { parseBlocks, type Block } from '@/website/blocks';
import SectionRenderer from '@/website/SectionRenderer.vue';

const route = useRoute();
const slug = String(route.params.slug || '');
const blocks = ref<Block[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const page = await cmsAdmin.pages.bySlug(slug);
    const draft = parseBlocks(page.draft_json);
    const live = parseBlocks(page.content_json);
    // 优先展示草稿（即「将发布」的内容）；无草稿则展示线上版
    blocks.value = draft.length ? draft : live.length ? live : [];
  } catch (e: any) {
    ElMessage.error(e?.message || '预览加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="draft-preview" v-loading="loading">
    <div class="dp-banner">
      <span>草稿预览 · 未发布内容（仅登录运营可见）</span>
      <router-link :to="`/admin/pages/editor/${slug}`">回到编辑器 ✎</router-link>
    </div>
    <div class="dp-canvas web-scope">
      <SectionRenderer :blocks="blocks" preview />
    </div>
  </div>
</template>

<style scoped>
/* 预览需官网样式：@import 由浏览器解析、不受 scoped 影响（与 WebsiteLayout / 编辑器同法） */
@import url('@/assets/website.css');

.draft-preview {
  min-height: 100%;
  background: #eef1f5;
}
.dp-banner {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fff7e6;
  border-bottom: 1px solid #ffe7ba;
  font-size: 13px;
  color: #ad6800;
}
.dp-banner a {
  color: #ad6800;
  font-weight: 600;
  text-decoration: none;
}
.dp-canvas {
  background: #fff;
}
</style>
