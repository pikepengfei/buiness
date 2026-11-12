<script setup lang="ts">
/**
 * 页面列表（装修入口）
 * 列表展示状态/草稿标记/发布时间，操作：装修（跳编辑器）/ 发布 / 下线 / 删除。
 * 新建页面入口已统一收敛到「官网配置-导航菜单 → 新增顶部导航页面」，本页只做装修与发布管理。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { PageListRow } from '@/types/cms';
import { isFixedPage } from '@/website/pageRoutes';

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
  // 前端也拦一道：固定一级页由代码维护，服务端同样会拒绝
  if (isFixedPage(row.slug)) {
    ElMessage.warning('固定页面不可删除，需要暂时隐藏请使用「下线」');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除页面「${row.title}」（${row.slug}）？将同时移除官网顶部对应栏目，该操作不可恢复。`,
      '删除确认', { type: 'warning' });
    await cmsAdmin.pages.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
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
          <el-button @click="load">刷新</el-button>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon class="pl-tip">
        新建页面入口在「官网配置-导航菜单 → 新增顶部导航页面」：创建时会同步生成顶部导航栏目与 /{标识} 地址，
        随后可在本页进行装修、发布、下线。
        首页、关于、产品、资讯、联系为固定页面，由代码维护，不可删除（需要临时隐藏请用「下线」）。
      </el-alert>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="title" label="页面标题" min-width="160" />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="isFixedPage(row.slug) ? 'info' : 'success'" size="small">
              {{ isFixedPage(row.slug) ? '固定' : '新增' }}
            </el-tag>
          </template>
        </el-table-column>
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
        <el-table-column label="操作" class-name="ops-col" width="280" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goEditor(row)">装修</el-button>
            <el-button link type="success" :disabled="row.status === 1" @click="togglePublish(row)">发布</el-button>
            <el-button link type="warning" :disabled="row.status !== 1" @click="togglePublish(row)">下线</el-button>
            <el-button link type="danger" :disabled="isFixedPage(row.slug)" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
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
.pl-tip {
  margin-bottom: 16px;
  line-height: 1.7;
}
.pages-list code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
/* 操作列按钮一行横向平铺，不换行 */
:deep(td.ops-col .cell) {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
:deep(td.ops-col .el-button + .el-button) {
  margin-left: 0;
}
</style>
