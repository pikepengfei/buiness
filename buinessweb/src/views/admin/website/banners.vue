<script setup lang="ts">
/**
 * Banner 管理：列表 + 新增/编辑弹窗 + 显隐/排序 + 删除
 * 字段对齐后端 POST/PATCH /banners（camelCase：imageUrl/linkUrl/position/sort/status/startAt/endAt）
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { BannerAdminRow } from '@/types/cms';
import MediaPicker from './components/MediaPicker.vue';

const rows = ref<BannerAdminRow[]>([]);
const loading = ref(false);
async function load() {
  loading.value = true;
  try {
    rows.value = await cmsAdmin.banners.list();
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const POS_OPTIONS = [
  { label: '首页 home', value: 'home' },
  { label: '产品 products', value: 'products' },
  { label: '资讯 news', value: 'news' },
  { label: '关于 about', value: 'about' },
];

const dlg = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const form = ref<any>({});
function openCreate() {
  editId.value = null;
  form.value = { title: '', imageUrl: '', linkUrl: '', position: 'home', sort: 0, status: 1 };
  dlg.value = true;
}
function openEdit(row: BannerAdminRow) {
  editId.value = row.id;
  form.value = {
    title: row.title || '', imageUrl: row.image_url, linkUrl: row.link_url || '',
    position: row.position, sort: row.sort, status: row.status,
  };
  dlg.value = true;
}
async function submit() {
  if (!form.value.imageUrl) {
    ElMessage.warning('请选择 Banner 图片');
    return;
  }
  saving.value = true;
  try {
    if (editId.value == null) await cmsAdmin.banners.create(form.value);
    else await cmsAdmin.banners.update(editId.value, form.value);
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: BannerAdminRow) {
  try {
    await cmsAdmin.banners.update(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function remove(row: BannerAdminRow) {
  try {
    await ElMessageBox.confirm('确认删除该 Banner？', '删除确认', { type: 'warning' });
    await cmsAdmin.banners.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// 上移/下移：交换位置后按当前显示顺序整批重写 sort（相邻 sort 相等时单纯交换无效）
async function move(index: number, dir: -1 | 1) {
  const target = index + dir;
  if (target < 0 || target >= rows.value.length) return;
  const next = [...rows.value];
  [next[index], next[target]] = [next[target], next[index]];
  try {
    await cmsAdmin.reorder('banners', next.map((r, i) => ({ id: r.id, sort: i })));
    ElMessage.success('顺序已保存');
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

// 图片选择
const picker = ref(false);
function picked(url: string) {
  form.value.imageUrl = url;
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">Banner 管理</span>
        <div>
          <el-button @click="load">刷新</el-button>
          <el-button type="primary" @click="openCreate">新增 Banner</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column label="预览" width="140">
        <template #default="{ row }">
          <img :src="row.image_url" class="bn-img" loading="lazy" />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="140" />
      <el-table-column prop="position" label="位置" width="110" />
      <el-table-column prop="link_url" label="跳转链接" min-width="150" show-overflow-tooltip />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="顺序" width="90" align="center">
        <template #default="{ $index }">
          <el-button link type="primary" :disabled="$index === 0" @click="move($index, -1)">↑</el-button>
          <el-button link type="primary" :disabled="$index === rows.length - 1" @click="move($index, 1)">↓</el-button>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="editId == null ? '新增 Banner' : '编辑 Banner'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="可选，用于备注管理" />
        </el-form-item>
        <el-form-item label="图片">
          <div class="img-row">
            <el-input v-model="form.imageUrl" placeholder="图片 URL，或从媒体库选择" />
            <el-button @click="picker = true">媒体库</el-button>
          </div>
          <img v-if="form.imageUrl" :src="form.imageUrl" class="bn-preview" />
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="form.linkUrl" placeholder="如：/products" />
        </el-form-item>
        <el-form-item label="展示位置">
          <el-select v-model="form.position" style="width: 100%">
            <el-option v-for="op in POS_OPTIONS" :key="op.value" :label="op.label" :value="op.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <MediaPicker v-model:visible="picker" @select="picked" />
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
.bn-img {
  width: 120px;
  height: 54px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f7fa;
  display: block;
}
.img-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.bn-preview {
  margin-top: 8px;
  max-width: 100%;
  border-radius: 6px;
}
</style>
