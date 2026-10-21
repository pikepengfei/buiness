<script setup lang="ts">
/**
 * 素材库：网格浏览 + 分类/关键词筛选 + 分页 + 本地直传上传 + 改名/归类 + 复制地址 + 删除
 * 删除由后端扫描内容引用，被引用时返回 409 并在 message 中列出引用位置
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { MediaItem } from '@/types/cms';

const list = ref<MediaItem[]>([]);
const loading = ref(false);
const uploading = ref(false);
const page = ref(1);
const pageSize = ref(24);
const total = ref(0);

// 筛选项：分类下拉由接口 meta.categories 填充
const categories = ref<string[]>([]);
const filterCategory = ref('');
const keyword = ref('');

async function load() {
  loading.value = true;
  try {
    const params: Record<string, any> = { page: page.value, pageSize: pageSize.value };
    if (filterCategory.value) params.category = filterCategory.value;
    if (keyword.value.trim()) params.keyword = keyword.value.trim();
    const res = await cmsAdmin.media.list(params);
    list.value = res.list;
    total.value = res.total;
    if (Array.isArray(res.meta?.categories)) categories.value = res.meta.categories;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function applyFilter() {
  page.value = 1;
  load();
}
onMounted(load);

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    await cmsAdmin.media.uploadDirect(file, 'website');
    ElMessage.success('上传成功');
    page.value = 1;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '上传失败');
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

async function copyUrl(item: MediaItem) {
  try {
    await navigator.clipboard.writeText(item.url);
    ElMessage.success('已复制图片地址');
  } catch {
    ElMessage.warning('复制失败，请手动选择地址');
  }
}
function fmtSize(n: number | null) {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}M` : `${Math.round(n / 1024)}KB`;
}

// 改名 / 归类：仅修改备注名与归类，不影响访问 URL
const editDlg = ref(false);
const editSaving = ref(false);
const editId = ref<number | null>(null);
const editForm = ref<{ originalName: string; category: string }>({ originalName: '', category: '' });
function openEdit(item: MediaItem) {
  editId.value = item.id;
  editForm.value = { originalName: item.original_name || item.filename, category: item.category };
  editDlg.value = true;
}
async function submitEdit() {
  if (editId.value == null) return;
  editSaving.value = true;
  try {
    await cmsAdmin.media.update(editId.value, {
      originalName: editForm.value.originalName,
      category: editForm.value.category,
    });
    ElMessage.success('保存成功');
    editDlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    editSaving.value = false;
  }
}

async function remove(item: MediaItem) {
  try {
    await ElMessageBox.confirm(`确认删除素材「${item.original_name || item.filename}」？`, '删除确认', { type: 'warning' });
    await cmsAdmin.media.remove(item.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    // 被引用时后端返回 409，message 含引用位置，原样展示给运营
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">素材库（{{ total }}）</span>
        <div class="hd-ops">
          <el-select v-model="filterCategory" placeholder="全部分类" clearable size="small" style="width: 150px" @change="applyFilter" @clear="applyFilter">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
          <el-input v-model="keyword" placeholder="搜索素材名称" clearable size="small" style="width: 180px" @change="applyFilter" @clear="applyFilter" @keyup.enter="applyFilter" />
          <el-button @click="load">刷新</el-button>
          <label class="up-btn">
            <el-button type="primary" :loading="uploading">上传图片</el-button>
            <input type="file" accept="image/*" hidden @change="onFile" />
          </label>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="md-grid">
      <div v-for="m in list" :key="m.id" class="md-cell">
        <div class="md-thumb">
          <img :src="m.url" :alt="m.original_name || m.filename" loading="lazy" />
        </div>
        <div class="md-info">
          <div class="md-name" :title="m.original_name || m.filename">{{ m.original_name || m.filename }}</div>
          <div class="md-meta">
            <span>{{ m.category }}</span>
            <span v-if="m.width">{{ m.width }}×{{ m.height }}</span>
            <span>{{ fmtSize(m.size) }}</span>
          </div>
          <div class="md-ops">
            <el-button link size="small" type="primary" @click="copyUrl(m)">复制地址</el-button>
            <a :href="m.url" target="_blank" class="md-open">打开</a>
            <el-button link size="small" @click="openEdit(m)">改名/归类</el-button>
            <el-button link size="small" type="danger" @click="remove(m)">删除</el-button>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && !list.length" description="暂无素材，点击右上角上传" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="(p: number) => { page = p; load(); }"
    />

    <el-dialog v-model="editDlg" title="改名/归类" width="420px">
      <el-form label-width="70px">
        <el-form-item label="备注名">
          <el-input v-model="editForm.originalName" placeholder="素材显示名称，不影响访问地址" />
        </el-form-item>
        <el-form-item label="归类">
          <el-select v-model="editForm.category" filterable allow-create default-first-option placeholder="选择或输入归类" style="width: 100%">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hd-t {
  font-weight: 600;
}
.hd-ops {
  display: flex;
  gap: 8px;
}
.up-btn {
  cursor: pointer;
}
.md-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  min-height: 200px;
}
.md-cell {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}
.md-thumb {
  height: 130px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}
.md-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.md-info {
  padding: 8px 10px;
}
.md-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.md-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #909399;
  margin: 4px 0;
}
.md-ops {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.md-open {
  font-size: 12px;
  color: #909399;
  text-decoration: none;
}
.pager {
  margin-top: 16px;
  justify-content: center;
}
</style>
