<script setup lang="ts">
/**
 * 产品分类管理：表格 + 新增/编辑弹窗 + 删除
 * 字段对齐后端 /product-categories（name/slug/description/parentId/sort）
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { ProductCategory } from '@/types/cms';

type Row = ProductCategory & { sort?: number };
const rows = ref<Row[]>([]);
const loading = ref(false);
async function load() {
  loading.value = true;
  try {
    rows.value = await cmsAdmin.productCategories.list();
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dlg = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const form = ref<any>({});
function openCreate() {
  editId.value = null;
  form.value = { name: '', slug: '', description: '', parentId: null, sort: 0 };
  dlg.value = true;
}
function openEdit(row: Row) {
  editId.value = row.id;
  form.value = { name: row.name, slug: row.slug, description: row.description || '', parentId: row.parent_id, sort: row.sort ?? 0 };
  dlg.value = true;
}
async function submit() {
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    ElMessage.warning('请填写名称与标识');
    return;
  }
  saving.value = true;
  const body = { ...form.value, parentId: form.value.parentId ?? undefined };
  try {
    if (editId.value == null) await cmsAdmin.productCategories.create(body);
    else await cmsAdmin.productCategories.update(editId.value, body);
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function remove(row: Row) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」？`, '删除确认', { type: 'warning' });
    await cmsAdmin.productCategories.remove(row.id);
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
    await cmsAdmin.reorder('product-categories', next.map((r, i) => ({ id: r.id, sort: i })));
    ElMessage.success('顺序已保存');
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">产品分类</span>
        <div>
          <el-button @click="load">刷新</el-button>
          <el-button type="primary" @click="openCreate">新增分类</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column prop="slug" label="标识" min-width="140" />
      <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="顺序" width="90" align="center">
        <template #default="{ $index }">
          <el-button link type="primary" :disabled="$index === 0" @click="move($index, -1)">↑</el-button>
          <el-button link type="primary" :disabled="$index === rows.length - 1" @click="move($index, 1)">↓</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="editId == null ? '新增分类' : '编辑分类'" width="520px">
      <el-form label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：移动存储" />
        </el-form-item>
        <el-form-item label="标识">
          <el-input v-model="form.slug" placeholder="URL 片段，如：portable" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
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
</style>
