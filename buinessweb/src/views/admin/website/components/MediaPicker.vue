<script setup lang="ts">
/**
 * 媒体选择器弹窗：浏览媒体库 / 本地上传（多选、拖拽），点选后回传图片 URL
 * 供装修编辑器 image 字段与内容表单复用
 * 上传多个时自动选中第一张成功的图片（本组件对外仅回传单张 URL）
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import type { MediaItem } from '@/types/cms';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'select', url: string): void;
}>();

const list = ref<MediaItem[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = 12;
const total = ref(0);
const dragDepth = ref(0);

const { uploading, done, total: upTotal, upload } = useMediaUpload('website');
// 与素材库页同理：label 内放 el-button（渲染为 <button>）会导致点击无法唤起文件选择框
const fileInput = ref<HTMLInputElement | null>(null);
const pickFiles = () => fileInput.value?.click();

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

async function handleFiles(files: File[]) {
  if (!files.length || uploading.value) return;
  const res = await upload(files);
  if (res.failures.length || res.skipped) {
    const detail = res.failures.slice(0, 2).map((f) => `${f.name}（${f.reason}）`).join('；');
    const suffix = res.skipped ? `；另有 ${res.skipped} 个超出单批上限被跳过` : '';
    ElMessage.warning(`${res.failures.length + res.skipped} 个文件未上传：${detail}${suffix}`);
  }
  // 本组件对外只回传单张 URL：多选上传成功后取第一张并关闭弹窗
  if (res.urls.length) {
    emit('select', res.urls[0]);
    emit('update:visible', false);
  }
}

function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement;
  handleFiles(Array.from(input.files || []));
  input.value = '';
}

function onDrop(ev: DragEvent) {
  dragDepth.value = 0;
  handleFiles(Array.from(ev.dataTransfer?.files || []));
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
      <el-button type="primary" plain :loading="uploading" @click="pickFiles">
        {{ uploading ? `上传中 ${done}/${upTotal}` : '上传新图片' }}
      </el-button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFiles" />
      <span class="mp-tip">点击媒体库图片即可选用，也可直接拖入图片上传</span>
    </div>
    <div
      class="mp-drop"
      :class="{ 'is-drag': dragDepth > 0 }"
      @dragenter.prevent="dragDepth++"
      @dragleave.prevent="dragDepth--"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div v-if="dragDepth > 0" class="mp-drop-hint">松开即可上传（可多选）</div>
      <div v-loading="loading" class="mp-grid">
        <div v-for="m in list" :key="m.id" class="mp-cell" @click="pick(m)">
          <img :src="m.url" :alt="m.original_name || m.filename" loading="lazy" />
          <span class="mp-name">{{ m.filename }}</span>
        </div>
        <el-empty v-if="!loading && !list.length" description="媒体库为空，可先上传" :image-size="60" />
      </div>
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
.mp-drop {
  position: relative;
  padding: 10px;
  border: 1px dashed transparent;
  border-radius: 8px;
  transition: border-color 0.15s, background 0.15s;
}
.mp-drop.is-drag {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.mp-drop-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--el-color-primary);
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  pointer-events: none;
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
