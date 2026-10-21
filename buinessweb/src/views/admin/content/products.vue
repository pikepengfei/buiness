<script setup lang="ts">
/**
 * 产品管理列表：服务端筛选（关键词/分类/状态）+ 分页 + 跳转编辑页 + 上下架 + 删除
 * 新增/编辑在产品编辑页（product-edit.vue）完成
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { ProductAdminRow, ProductCategory } from '@/types/cms';

const router = useRouter();
const rows = ref<ProductAdminRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const keyword = ref('');
const categoryId = ref<number | ''>('');
const status = ref<number | ''>('');
const cats = ref<ProductCategory[]>([]);

async function loadCats() {
  try {
    cats.value = await cmsAdmin.productCategories.list();
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
    const res = await cmsAdmin.products.list(params);
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
  router.push(id ? `/admin/content/products/edit/${id}` : '/admin/content/products/edit');
}
async function toggleStatus(row: ProductAdminRow) {
  try {
    await cmsAdmin.products.update(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
    ElMessage.success(row.status === 1 ? '已上架' : '已下架');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}
async function remove(row: ProductAdminRow) {
  try {
    await ElMessageBox.confirm(`确认删除产品「${row.name}」？`, '删除确认', { type: 'warning' });
    await cmsAdmin.products.remove(row.id);
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
        <span class="hd-t">产品管理</span>
        <div class="hd-ops">
          <el-input
            v-model="keyword"
            placeholder="搜索产品名称 / 系列"
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
            <el-option label="上架" :value="1" />
            <el-option label="下架" :value="0" />
          </el-select>
          <el-button size="small" @click="load">刷新</el-button>
          <el-button size="small" type="primary" @click="goEdit()">新增产品</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column label="封面" width="90">
        <template #default="{ row }">
          <img v-if="row.cover_image" :src="row.cover_image" class="pc-img" loading="lazy" />
          <span v-else class="pc-none">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="slug" label="标识" min-width="140" />
      <el-table-column prop="series" label="系列" min-width="120" />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row.id)">编辑</el-button>
          <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '下架' : '上架' }}</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
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
.pc-img {
  width: 64px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f7fa;
  display: block;
}
</style>
