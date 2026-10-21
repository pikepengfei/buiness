<script setup lang="ts">
/**
 * 页面列表（装修入口）
 * 列表展示状态/草稿标记/发布时间，操作：装修（跳编辑器）/ 发布 / 下线 / 删除；支持新建页面
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { PageListRow } from '@/types/cms';

const router = useRouter();

const rows = ref<PageListRow[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.pages.list();
    rows.value = res.list;
  } catch (e: any) {
    ElMessage.error(e?.message || '页面列表加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function goEditor(row: PageListRow) {
  router.push(`/admin/pages/editor/${row.slug}`);
}

async function togglePublish(row: PageListRow) {
  try {
    if (row.status === 1) {
      await ElMessageBox.confirm(`确认下线页面「${row.title}」？下线后官网将不再展示该页面。`, '下线确认', { type: 'warning' });
      await cmsAdmin.pages.unpublish(row.id);
      ElMessage.success('已下线');
    } else {
      await cmsAdmin.pages.publish(row.id);
      ElMessage.success('已发布');
    }
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

async function remove(row: PageListRow) {
  try {
    await ElMessageBox.confirm(`确认删除页面「${row.title}」（${row.slug}）？该操作不可恢复。`, '删除确认', { type: 'warning' });
    await cmsAdmin.pages.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// ---- 新建页面 ----
const createVisible = ref(false);
const creating = ref(false);
const createForm = ref({ slug: '', title: '' });
function openCreate() {
  createForm.value = { slug: '', title: '' };
  createVisible.value = true;
}
async function submitCreate() {
  const { slug, title } = createForm.value;
  if (!slug.trim() || !title.trim()) {
    ElMessage.warning('请填写页面标识与标题');
    return;
  }
  creating.value = true;
  try {
    await cmsAdmin.pages.create({ slug: slug.trim(), title: title.trim(), contentJson: { blocks: [] } });
    ElMessage.success('创建成功');
    createVisible.value = false;
    router.push(`/admin/pages/editor/${slug.trim()}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

function fmtTime(v: string | null) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <div class="pages-list">
    <el-card shadow="never">
      <template #header>
        <div class="pl-header">
          <span class="pl-title">页面装修</span>
          <div>
            <el-button @click="load">刷新</el-button>
            <el-button type="primary" @click="openCreate">新建页面</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="title" label="页面标题" min-width="160" />
        <el-table-column prop="slug" label="页面标识" min-width="120">
          <template #default="{ row }"><code>{{ row.slug }}</code></template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? '已发布' : '未发布' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="草稿" width="130" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.has_unpublished_draft" type="warning" size="small">有未发布修改</el-tag>
            <span v-else class="pl-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.published_at) }}</template>
        </el-table-column>
        <el-table-column label="最近更新" width="180">
          <template #default="{ row }">{{ fmtTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goEditor(row)">装修</el-button>
            <el-button link type="success" :disabled="row.status === 1" @click="togglePublish(row)">发布</el-button>
            <el-button link type="warning" :disabled="row.status !== 1" @click="togglePublish(row)">下线</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="createVisible" title="新建页面" width="440px">
      <el-form label-width="90px">
        <el-form-item label="页面标识">
          <el-input v-model="createForm.slug" placeholder="URL 片段，如：solutions（仅小写字母/数字/中划线）" />
        </el-form-item>
        <el-form-item label="页面标题">
          <el-input v-model="createForm.title" placeholder="如：解决方案" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建并装修</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pl-title {
  font-weight: 600;
}
.pl-muted {
  color: #c0c4cc;
}
.pages-list code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
