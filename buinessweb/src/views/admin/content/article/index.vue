<script setup lang="ts">
/**
 * 资讯管理列表（两张表的并集，一条条目恰好一行）
 * 一行只有一个 id，动作由「在哪张表 + state」决定：
 *   已上线（发布表）→ 只读，界面唯一动作是「下线」；编辑与删除入口一律不渲染
 *   草稿 / 已下线（未发布表）→ 「编辑」「发布」「删除」
 * 写请求必带 uid：两表主键各自递增，数字相同不代表同一条内容。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useAuthStore } from '@/stores/auth';
import type { ArticleAdminRow, ArticleCategoryAdminRow } from '@/types/cms';

const auth = useAuthStore();
// 只有 content:read 的账号不留任何写入口：新增/发布/下线/删除一律不渲染，编辑入口降级为「查看」
const canWrite = computed(() => auth.hasPerm('content:write'));

const router = useRouter();
const rows = ref<ArticleAdminRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const keyword = ref('');
const categoryId = ref<number | ''>('');
// 筛选仍用 0/1/2：服务端按「哪张表 + state」翻译，与列表 state 派生同一口径
const status = ref<number | ''>('');
const cats = ref<ArticleCategoryAdminRow[]>([]);

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
}
);

// 寻址按行所在表：已上线行是发布表 id（path），未发布行只能走 query.draft
function goEdit(row?: ArticleAdminRow) {
  if (!row) {
    router.push('/admin/content/articles/edit');
    return;
  }
  if (row.origin === 'online') router.push(`/admin/content/articles/edit/${row.id}`);
  else router.push({ path: '/admin/content/articles/edit', query: { draft: String(row.id) } });
}

/** 发布 = 把未发布行整行搬进发布表：浏览量与首次发布时间随行保留，不重新生成身份 */
async function publish(row: ArticleAdminRow) {
  try {
    const res = await cmsAdmin.articleDrafts.publish(row.id, row.uid);
    ElMessage.success(res.first_published ? '已发布' : `已发布（沿用原发布时间，浏览量 ${res.view_count}）`);
    if (res.stripped_images > 0) ElMessage.warning(`正文中 ${res.stripped_images} 张站外图片已被移除`);
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '发布失败');
  }
}
async function unpublish(row: ArticleAdminRow) {
  try {
    await ElMessageBox.confirm(
      `确认下线资讯「${row.title}」？下线后官网立即不可访问，内容会保留在未发布区，需重新发布才恢复。`,
      '下线确认', { type: 'warning' });
    await cmsAdmin.articles.unpublish(row.id);
    ElMessage.success('已下线，内容在未发布区可继续编辑');
    load();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e?.message || '下线失败');
  }
}
/** 删除只作用于未发布侧：本表行与线上内容毫无关联，删不到任何已上线内容 */
async function remove(row: ArticleAdminRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除${row.state === 'offline' ? '已下线内容' : '草稿'}「${row.title}」？删除后不可恢复。`,
      '删除确认', { type: 'warning' });
    await cmsAdmin.articleDrafts.remove(row.id, row.uid);
    ElMessage.success('已删除');
    load();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}
const STATE_TAG: Record<ArticleAdminRow['state'], string> = {
  draft: 'info',
  published: 'success',
  offline: 'warning',
};
function fmt(v: string | null | undefined) {
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
            <el-option label="已上线" :value="1" />
            <el-option label="已下线" :value="2" />
          </el-select>
          <el-button size="small" @click="load">刷新</el-button>
          <el-button v-if="canWrite" size="small" type="primary" @click="goEdit()">新增资讯</el-button>
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
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column prop="slug" label="标识" min-width="140" show-overflow-tooltip />
      <el-table-column label="状态" width="96" align="center">
        <template #default="{ row }">
          <!-- 文案取自服务端统一常量，前端不再维护第二份称谓 -->
          <el-tag :type="(STATE_TAG[row.state as ArticleAdminRow['state']] as any) || 'info'" size="small">{{ row.state_text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="160">
        <template #default="{ row }">{{ fmt(row.published_at) }}</template>
      </el-table-column>
      <el-table-column label="修改人" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.updated_by_name || '—' }}</template>
      </el-table-column>
      <el-table-column label="修改时间" width="160">
        <template #default="{ row }">{{ fmt(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column prop="view_count" label="浏览" width="72" align="center" />
      <el-table-column label="操作" width="210" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row)">{{ row.origin === 'online' ? '查看' : (canWrite ? '编辑' : '查看') }}</el-button>
          <el-button v-if="canWrite && row.origin === 'draft'" link type="success" @click="publish(row)">发布</el-button>
          <el-button v-if="canWrite && row.origin === 'online'" link type="warning" @click="unpublish(row)">下线</el-button>
          <el-button v-if="canWrite && row.origin === 'draft'" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      class="pager"
      layout="total, sizes, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      :page-sizes="[12, 24, 48]"
      @current-change="(p: number) => { page = p; load(); }"
      @size-change="(s: number) => { pageSize = s; page = 1; load(); }"
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
