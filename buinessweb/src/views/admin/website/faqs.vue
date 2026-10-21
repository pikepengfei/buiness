<script setup lang="ts">
/**
 * FAQ 管理：列表（按分类筛选）+ 新增/编辑弹窗 + 排序/启停 + 删除
 * 字段对齐后端 POST/PATCH /faqs（question/answer/category/sort/status）
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';

type FaqRow = { id: number; question: string; answer: string; category: string; sort: number; status: number };

const rows = ref<FaqRow[]>([]);
const loading = ref(false);
const filterCat = ref('');

async function load() {
  loading.value = true;
  try {
    rows.value = (await cmsAdmin.faqs.list()) as FaqRow[];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const categories = computed(() => Array.from(new Set(rows.value.map((r) => r.category))).sort());
const shown = computed(() => (filterCat.value ? rows.value.filter((r) => r.category === filterCat.value) : rows.value));

const dlg = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const form = ref<any>({});
function openCreate() {
  editId.value = null;
  form.value = { question: '', answer: '', category: 'general', sort: 0, status: 1 };
  dlg.value = true;
}
function openEdit(row: FaqRow) {
  editId.value = row.id;
  form.value = { ...row };
  dlg.value = true;
}
async function submit() {
  if (!form.value.question.trim()) {
    ElMessage.warning('请填写问题');
    return;
  }
  saving.value = true;
  try {
    if (editId.value == null) await cmsAdmin.faqs.create(form.value);
    else await cmsAdmin.faqs.update(editId.value, form.value);
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function toggleStatus(row: FaqRow) {
  try {
    await cmsAdmin.faqs.update(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function remove(row: FaqRow) {
  try {
    await ElMessageBox.confirm('确认删除该 FAQ？', '删除确认', { type: 'warning' });
    await cmsAdmin.faqs.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// 上移/下移：在当前分类视图内交换位置，按显示顺序整批重写 sort（相邻 sort 相等时单纯交换无效）
async function move(index: number, dir: -1 | 1) {
  const list = shown.value;
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  try {
    await cmsAdmin.reorder('faqs', next.map((r, i) => ({ id: r.id, sort: i })));
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
        <span class="hd-t">FAQ 管理</span>
        <div class="hd-ops">
          <el-select v-model="filterCat" placeholder="全部分类" clearable size="small" style="width: 160px">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
          <el-button @click="load">刷新</el-button>
          <el-button type="primary" @click="openCreate">新增 FAQ</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="shown" stripe>
      <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="answer" label="答案" min-width="260" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="顺序" width="90" align="center">
        <template #default="{ $index }">
          <el-button link type="primary" :disabled="$index === 0" @click="move($index, -1)">↑</el-button>
          <el-button link type="primary" :disabled="$index === shown.length - 1" @click="move($index, 1)">↓</el-button>
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

    <el-dialog v-model="dlg" :title="editId == null ? '新增 FAQ' : '编辑 FAQ'" width="600px">
      <el-form label-width="70px">
        <el-form-item label="问题">
          <el-input v-model="form.question" placeholder="用户常见问题" />
        </el-form-item>
        <el-form-item label="答案">
          <el-input v-model="form.answer" type="textarea" :rows="5" placeholder="答案，支持基础 HTML，保存时后端清洗" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="form.category" placeholder="如：general / product / cooperation" />
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
  align-items: center;
  gap: 8px;
}
</style>
