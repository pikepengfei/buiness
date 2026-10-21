<script setup lang="ts">
/**
 * 媒体选择器弹窗：浏览媒体库 / 本地上传，点选后回传图片 URL
 * 供装修编辑器 image 字段与内容表单复用
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { MediaItem } from '@/types/cms';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'select', url: string): void;
}>();

const list = ref<MediaItem[]>([]);
const loading = ref(false);
const uploading = ref(false);
const page = ref(1);
const pageSize = 12;
const total = ref(0);

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.media.list({ page: page.value, pageSize });
    list.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '媒体库加载失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) load();
  }
);

function pick(item: MediaItem) {
  emit('select', item.url);
  emit('update:visible', false);
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const res = await cmsAdmin.media.uploadDirect(file, 'website');
    ElMessage.success('上传成功');
    emit('select', res.url);
    emit('update:visible', false);
  } catch (e: any) {
    ElMessage.error(e?.message || '上传失败');
  } finally {
    uploading.value = false;
    input.value = '';
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="选择图片"
    width="760px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="mp-toolbar">
      <label class="mp-upload">
        <el-button type="primary" plain :loading="uploading">上传新图片</el-button>
        <input type="file" accept="image/*" hidden @change="onFile" />
      </label>
      <span class="mp-tip">点击媒体库图片即可选用</span>
    </div>
    <div v-loading="loading" class="mp-grid">
      <div v-for="m in list" :key="m.id" class="mp-cell" @click="pick(m)">
        <img :src="m.url" :alt="m.original_name || m.filename" loading="lazy" />
        <span class="mp-name">{{ m.filename }}</span>
      </div>
      <el-empty v-if="!loading && !list.length" description="媒体库为空，可先上传" :image-size="60" />
    </div>
    <el-pagination
      v-if="total > pageSize"
      class="mp-pager"
      layout="prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="(p: number) => { page = p; load(); }"
    />
  </el-dialog>
</template>

<style scoped>
.mp-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.mp-tip {
  font-size: 12px;
  color: #909399;
}
.mp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  min-height: 200px;
}
.mp-cell {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}
.mp-cell:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.mp-cell img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  display: block;
  background: #f5f7fa;
}
.mp-name {
  display: block;
  padding: 6px 8px;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-pager {
  margin-top: 14px;
  justify-content: center;
}
</style>
