<script setup lang="ts">
/**
 * 用户管理：分页列表 + 新增/编辑弹窗 + 启停 + 删除（不能删自己）
 * create body：username,password,displayName,email,roleId,avatarUrl
 * update body：displayName,email,roleId,status,password(可选)
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { RoleRow, UserRow } from '@/types/cms';

const rows = ref<UserRow[]>([]);
const roles = ref<RoleRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.users.list({ page: page.value, pageSize: pageSize.value });
    rows.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  try {
    roles.value = await cmsAdmin.roles.list();
  } catch {
    /* 角色加载失败不阻断 */
  }
  load();
});

const dlg = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const form = ref<any>({});
function openCreate() {
  editId.value = null;
  form.value = { username: '', password: '', displayName: '', email: '', roleId: roles.value[0]?.id ?? 1 };
  dlg.value = true;
}
function openEdit(row: UserRow) {
  editId.value = row.id;
  form.value = { displayName: row.display_name, email: row.email || '', roleId: row.role_id, status: row.status, password: '' };
  dlg.value = true;
}
async function submit() {
  if (editId.value == null && (!form.value.username.trim() || !form.value.password || !form.value.displayName.trim())) {
    ElMessage.warning('请填写用户名、密码与姓名');
    return;
  }
  saving.value = true;
  try {
    if (editId.value == null) {
      await cmsAdmin.users.create({
        username: form.value.username.trim(), password: form.value.password,
        displayName: form.value.displayName.trim(), email: form.value.email || undefined, roleId: form.value.roleId,
      });
    } else {
      const body: Record<string, any> = {
        displayName: form.value.displayName, email: form.value.email || undefined,
        roleId: form.value.roleId, status: form.value.status,
      };
      if (form.value.password) body.password = form.value.password;
      await cmsAdmin.users.update(editId.value, body);
    }
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
async function toggleStatus(row: UserRow) {
  try {
    await cmsAdmin.users.update(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function remove(row: UserRow) {
  try {
    await ElMessageBox.confirm(`确认删除用户「${row.username}」？`, '删除确认', { type: 'warning' });
    await cmsAdmin.users.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}
function fmt(v: string | null) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">用户管理</span>
        <div>
          <el-button @click="load">刷新</el-button>
          <el-button type="primary" @click="openCreate">新增用户</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="username" label="用户名" min-width="130" />
      <el-table-column prop="display_name" label="姓名" min-width="120" />
      <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
      <el-table-column prop="role_name" label="角色" width="120" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近登录" width="170">
        <template #default="{ row }">{{ fmt(row.last_login_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="(p: number) => { page = p; load(); }"
    />

    <el-dialog v-model="dlg" :title="editId == null ? '新增用户' : '编辑用户'" width="500px">
      <el-form label-width="80px">
        <template v-if="editId == null">
          <el-form-item label="用户名" required>
            <el-input v-model="form.username" placeholder="登录账号" />
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input v-model="form.password" type="password" show-password placeholder="至少 8 位" />
          </el-form-item>
        </template>
        <el-form-item label="姓名" :required="editId == null">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="可选" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleId" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editId != null" label="重置密码">
          <el-input v-model="form.password" type="password" show-password placeholder="留空则不修改" />
        </el-form-item>
        <el-form-item v-if="editId != null" label="状态">
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
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
