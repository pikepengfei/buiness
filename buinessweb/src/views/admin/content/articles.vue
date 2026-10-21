<script setup lang="ts">
/**
 * 资讯管理列表：服务端筛选（关键词/分类/状态）+ 分页 + 跳转编辑 + 发布/下线 + 删除
 * 状态：0 草稿 / 1 已发布 / 2 已下线
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { ArticleAdminRow, ArticleCategory } from '@/types/cms';

const router = useRouter();
const rows = ref<ArticleAdminRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const keyword = ref('');
const categoryId = ref<number | ''>('');
const status = ref<number | ''>('');
const cats = ref<ArticleCategory[]>([]);

async function loadCats() {
  try {
    cats.value = await cmsAdmin.articleCategories.list();
  } catch (e: any) {
    ElMessage.error(e?.message || '分类加载失败');
  }
}

async function load() {
  loading.value = true;
  try {
    const params: Record<string, any> = { page: page.value, pageSize: pageSize.value };
    const kw = keyword.value.trim();
    if (kw) params.keyword = kw;
    if (categoryId.value !== '') params.categoryId = categoryId.value;
    if (status.value !== '') params.status = status.value;
    const res = await cmsAdmin.articles.list(params);
    rows.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
function search() {
  page.value = 1;
  load();
}
onMounted(() => {
  loadCats();
  load();
});

function goEdit(id?: number) {
  router.push(id ? `/admin/content/articles/edit/${id}` : '/admin/content/articles/edit');
}
async function publish(row: ArticleAdminRow) {
  try {
    await cmsAdmin.articles.publish(row.id);
    ElMessage.success('已发布');
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '发布失败');
  }
}
async function unpublish(row: ArticleAdminRow) {
  try {
    await cmsAdmin.articles.unpublish(row.id);
    ElMessage.success('已下线');
    load();
  } catch (e: any) {
    ElMessage.error(e?.message || '下线失败');
  }
}
async function remove(row: ArticleAdminRow) {
  try {
    await ElMessageBox.confirm(`确认删除资讯「${row.title}」？`, '删除确认', { type: 'warning' });
    await cmsAdmin.articles.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}
const STATUS: Record<number, { text: string; type: string }> = {
  0: { text: '草稿', type: 'info' },
  1: { text: '已发布', type: 'success' },
  2: { text: '已下线', type: 'warning' },
};
function fmt(v: string | null) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">资讯管理</span>
        <div class="hd-ops">
          <el-input
            v-model="keyword"
            placeholder="搜索标题 / 摘要"
            size="small"
            style="width: 200px"
            clearable
            @keyup.enter="search"
            @clear="search"
          />
          <el-button size="small" @click="search">查询</el-button>
          <el-select v-model="categoryId" size="small" style="width: 140px" @change="search">
            <el-option label="全部分类" :value="''" />
            <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select v-model="status" size="small" style="width: 120px" @change="search">
            <el-option label="全部状态" :value="''" />
            <el-option label="草稿" :value="0" />
            <el-option label="已发布" :value="1" />
            <el-option label="已下线" :value="2" />
          </el-select>
          <el-button size="small" @click="load">刷新</el-button>
          <el-button size="small" type="primary" @click="goEdit()">新增资讯</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column label="封面" width="90">
        <template #default="{ row }">
          <img v-if="row.cover_image" :src="row.cover_image" class="ac-img" loading="lazy" />
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="slug" label="标识" min-width="150" show-overflow-tooltip />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="(STATUS[row.status]?.type as any) || 'info'" size="small">{{ STATUS[row.status]?.text || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="170">
        <template #default="{ row }">{{ fmt(row.published_at) }}</template>
      </el-table-column>
      <el-table-column prop="view_count" label="浏览" width="80" align="center" />
      <el-table-column label="操作" width="190" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row.id)">编辑</el-button>
          <el-button v-if="row.status !== 1" link type="success" @click="publish(row)">发布</el-button>
          <el-button v-if="row.status === 1" link type="warning" @click="unpublish(row)">下线</el-button>
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
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.pager {
  margin-top: 14px;
  justify-content: flex-end;
}
.ac-img {
  width: 64px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f7fa;
  display: block;
}
</style>
