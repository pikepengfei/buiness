<script setup lang="ts">
/**
 * 导航菜单管理：树形表格 + 新增（顶级/子项）/编辑/删除 + 启停
 * 字段对齐后端 /menus（parentId/title/url/target/sort/status）；官网顶部导航数据源
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { MenuItem } from '@/types/cms';

const tree = ref<MenuItem[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const raw = await cmsAdmin.menus.tree();
    // el-table 树形：空 children 需删除，否则出现展开箭头
    const clean = (nodes: MenuItem[]): MenuItem[] =>
      nodes.map((n) => ({
        ...n,
        children: n.children && n.children.length ? clean(n.children) : undefined,
      }));
    tree.value = clean(raw);
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
function openCreate(parent?: MenuItem) {
  editId.value = null;
  form.value = { parentId: parent?.id ?? null, title: '', url: '', target: '_self', sort: 0, status: 1 };
  dlg.value = true;
}
function openEdit(row: MenuItem) {
  editId.value = row.id;
  form.value = { parentId: row.parent_id, title: row.title, url: row.url, target: row.target, sort: row.sort, status: row.status };
  dlg.value = true;
}
async function submit() {
  if (!form.value.title.trim() || !form.value.url.trim()) {
    ElMessage.warning('请填写名称与链接');
    return;
  }
  saving.value = true;
  const body = { ...form.value, parentId: form.value.parentId ?? undefined };
  try {
    if (editId.value == null) await cmsAdmin.menus.create(body);
    else await cmsAdmin.menus.update(editId.value, body);
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function toggleStatus(row: MenuItem) {
  try {
    await cmsAdmin.menus.update(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function remove(row: MenuItem) {
  try {
    await ElMessageBox.confirm(`确认删除菜单「${row.title}」？子菜单需先行处理。`, '删除确认', { type: 'warning' });
    await cmsAdmin.menus.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">导航菜单</span>
        <div>
          <el-button @click="load">刷新</el-button>
          <el-button type="primary" @click="openCreate()">新增顶级菜单</el-button>
        </div>
      </div>
    </template>
    <el-alert type="info" :closable="false" show-icon class="tip">
      此处配置官网顶部导航。首页等固定入口由前端内置，这里维护产品 / 资讯 / 关于 / 联系等主导航及其子项。
    </el-alert>
    <el-table
      v-loading="loading"
      :data="tree"
      row-key="id"
      default-expand-all
      :tree-props="{ children: 'children' }"
    >
      <el-table-column prop="title" label="名称" min-width="200" />
      <el-table-column prop="url" label="链接" min-width="200" />
      <el-table-column prop="target" label="打开方式" width="110" />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link @click="openCreate(row)">加子项</el-button>
          <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="editId == null ? '新增菜单' : '编辑菜单'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="上级">
          <el-input :model-value="form.parentId ? `ID ${form.parentId}` : '顶级菜单'" disabled />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.title" placeholder="导航显示文字，如：产品中心" />
        </el-form-item>
        <el-form-item label="链接">
          <el-input v-model="form.url" placeholder="如：/products" />
        </el-form-item>
        <el-form-item label="打开方式">
          <el-radio-group v-model="form.target">
            <el-radio value="_self">当前窗口</el-radio>
            <el-radio value="_blank">新窗口</el-radio>
          </el-radio-group>
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
.tip {
  margin-bottom: 12px;
}
</style>
