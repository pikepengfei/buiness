<script setup lang="ts">
/**
 * 审计日志：按操作对象类型/动作/关键词筛选 + 分页
 * 数据 GET /audit（后端按 created_at 倒序，LEFT JOIN users 返回 username）
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { AuditRow } from '@/types/cms';

type Row = AuditRow & { username?: string | null };

const rows = ref<Row[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const filterType = ref('');
const filterAction = ref('');
const keyword = ref('');

async function load() {
  loading.value = true;
  try {
    const params: Record<string, any> = { page: page.value, pageSize: pageSize.value };
    if (filterType.value) params.entityType = filterType.value;
    if (filterAction.value) params.action = filterAction.value;
    if (keyword.value.trim()) params.keyword = keyword.value.trim();
    const res = await cmsAdmin.audit.list(params);
    rows.value = res.list;
    total.value = res.total;
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

const ACTION: Record<string, { text: string; type: string }> = {
  create: { text: '新建', type: 'success' },
  update: { text: '更新', type: 'primary' },
  delete: { text: '删除', type: 'danger' },
  publish: { text: '发布', type: 'warning' },
  unpublish: { text: '下线', type: 'info' },
  reorder: { text: '排序', type: 'primary' },
  discard_draft: { text: '丢弃草稿', type: 'info' },
};
const ENTITY: Record<string, string> = {
  page: '页面', product: '产品', article: '资讯', banner: 'Banner', faq: 'FAQ',
  setting: '设置', media: '素材', menu: '菜单', product_category: '产品分类',
  article_category: '资讯分类', user: '用户', lead: '线索',
};
const ENTITY_OPTS = ['page', 'product', 'article', 'banner', 'faq', 'setting', 'media', 'menu', 'product_category', 'article_category', 'user', 'lead'];
const ACTION_OPTS = ['create', 'update', 'delete', 'publish', 'unpublish', 'reorder', 'discard_draft'];
function fmt(v: string) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">审计日志</span>
        <div class="hd-ops">
          <el-select v-model="filterType" placeholder="全部对象" clearable size="small" style="width: 130px" @change="applyFilter" @clear="applyFilter">
            <el-option v-for="t in ENTITY_OPTS" :key="t" :label="ENTITY[t] || t" :value="t" />
          </el-select>
          <el-select v-model="filterAction" placeholder="全部动作" clearable size="small" style="width: 120px" @change="applyFilter" @clear="applyFilter">
            <el-option v-for="a in ACTION_OPTS" :key="a" :label="ACTION[a]?.text || a" :value="a" />
          </el-select>
          <el-input v-model="keyword" placeholder="搜索实体/操作人" clearable size="small" style="width: 180px" @change="applyFilter" @clear="applyFilter" @keyup.enter="applyFilter" />
          <el-button @click="load">刷新</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="(ACTION[row.action]?.type as any) || 'info'" size="small">{{ ACTION[row.action]?.text || row.action }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="实体类型" width="120">
        <template #default="{ row }">{{ ENTITY[row.entity_type] || row.entity_type }}</template>
      </el-table-column>
      <el-table-column prop="entity_id" label="实体 ID" width="110" />
      <el-table-column label="操作人" min-width="120">
        <template #default="{ row }">{{ row.username || '系统' }}</template>
      </el-table-column>
      <el-table-column prop="user_id" label="操作人 ID" width="100" />
      <el-table-column prop="ip" label="IP" min-width="130" />
      <el-table-column label="时间" width="180">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !rows.length" description="暂无审计记录" />
    <el-pagination
      v-if="total > pageSize"
      class="pager"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="(p: number) => { page = p; load(); }"
    />
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
.pager {
  margin-top: 16px;
  justify-content: center;
}
</style>
