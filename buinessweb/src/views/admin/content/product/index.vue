<script setup lang="ts">
/**
 * 产品管理列表（两张表的并集，一条产品恰好一行）
 * 一行只有一个 id，动作由「在哪张表 + state」决定：
 *   已上架（线上表）→ 内容只读，界面动作只有「查看」「下架」「调整排序」；编辑与删除入口一律不渲染
 *   草稿 / 已下架（未上架表）→ 「编辑」「发布」「删除」
 * 写请求必带 uid：两表主键各自递增，数字相同不代表同一条产品。
 * 状态列显示服务端下发的 state_text（称谓单点在 PRODUCT_STATE_TEXT），本页只维护「状态 → 标签颜色」；
 * 筛选下拉的三个选项标签是本页仅有的中文硬编码，改称谓须与后端常量同步。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useAuthStore } from '@/stores/auth';
import type { ProductAdminRow, ProductCategoryAdminRow } from '@/types/cms';

const auth = useAuthStore();
// 只有 content:read 的账号不留任何写入口：新增/发布/下架/调整排序/删除一律不渲染，编辑入口降级为「查看」
const canWrite = computed(() => auth.hasPerm('content:write'));

const router = useRouter();
const rows = ref<ProductAdminRow[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(12);
const total = ref(0);
const keyword = ref('');
const categoryId = ref<number | ''>('');
// 筛选传 status=0|1|2：服务端按「哪张表 + state」翻译，与列表 state 派生同一口径
const status = ref<number | ''>('');
const cats = ref<ProductCategoryAdminRow[]>([]);

async function loadCats() {
  try {
    const list = await cmsAdmin.productCategories.list();
    // 分类 id 是 BIGINT，驱动按字符串回传；筛选项与列表行的 category_id 数字统一，下拉才不会选了却不回填
    cats.value = list.map((c) => ({ ...c, id: Number(c.id) }));
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

// 寻址按行所在表：已上架行是线上表 id（path），未上架行只能走 query.draft
function goEdit(row?: ProductAdminRow) {
  if (!row) {
    router.push('/admin/content/products/edit');
    return;
  }
  if (row.origin === 'online') router.push(`/admin/content/products/edit/${row.id}`);
  else router.push({ path: '/admin/content/products/edit', query: { draft: String(row.id) } });
}

/** 发布 = 把未上架行整行搬进线上表：上架时间与排序值随行保留，不重新生成身份 */
async function publish(row: ProductAdminRow) {
  try {
    const res = await cmsAdmin.productDrafts.publish(row.id, row.uid);
    ElMessage.success(res.first_published
      ? '已上架'
      : `已上架（沿用首次上架时间，排序值 ${res.sort}）`);
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上架失败');
  }
}
/** 下架 = 整行搬回未上架表：确认文案点名官网地址立即失效，运营知道访客会撞到什么 */
async function unpublish(row: ProductAdminRow) {
  try {
    await ElMessageBox.confirm(
      `确认下架产品「${row.name}」？下架后官网立即不可访问，内容保留在未上架区，需重新发布才恢复；`
      + `该产品的官网地址 /product/${row.slug} 立即失效。`,
      '下架确认', { type: 'warning' });
    await cmsAdmin.products.unpublish(row.id, row.uid);
    ElMessage.success('已下架，内容在未上架区可继续编辑');
    load();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e?.message || '下架失败');
  }
}
/** 删除只作用于未上架侧：本表行与线上内容毫无关联，删不到任何已上架产品 */
async function remove(row: ProductAdminRow) {
  try {
    await ElMessageBox.confirm(
      `确认删除${row.state === 'offline' ? '已下架内容' : '草稿'}「${row.name}」？删除后不可恢复。`,
      '删除确认', { type: 'warning' });
    await cmsAdmin.productDrafts.remove(row.id, row.uid);
    ElMessage.success('已删除');
    load();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}

// ---------------- 调整排序：线上行唯一可改的列，走专用端点，不碰内容 ----------------
const sortDlg = ref(false);
const sortSaving = ref(false);
const sortRow = ref<ProductAdminRow | null>(null);
const sortValue = ref(0);
function openSort(row: ProductAdminRow) {
  sortRow.value = row;
  sortValue.value = Number(row.sort ?? 0);
  sortDlg.value = true;
}
async function submitSort() {
  const row = sortRow.value;
  if (!row || sortSaving.value) return;
  sortSaving.value = true;
  try {
    const res = await cmsAdmin.products.setOnlineSort(row.id, row.uid, sortValue.value);
    ElMessage.success(`排序已更新为 ${res.sort}`);
    sortDlg.value = false;
    // 重新取数而不是本地改 sort：列表顺序由服务端全序决定，本地猜测会和翻页结果不一致
    load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '排序更新失败');
  } finally {
    sortSaving.value = false;
  }
}

const STATE_TAG: Record<ProductAdminRow['state'], string> = {
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
        <span class="hd-t">产品管理</span>
        <div class="hd-ops">
          <el-input
            v-model="keyword"
            placeholder="搜索名称 / 系列"
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
            <el-option label="已上架" :value="1" />
            <el-option label="已下架" :value="2" />
          </el-select>
          <el-button size="small" @click="load">刷新</el-button>
          <el-button v-if="canWrite" size="small" type="primary" @click="goEdit()">新增产品</el-button>
        </div>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column label="封面" width="90">
        <template #default="{ row }">
          <img v-if="row.cover_image" :src="row.cover_image" class="pc-img" loading="lazy" />
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="名称" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="pc-name">{{ row.name }}</div>
          <div v-if="row.series" class="pc-series">{{ row.series }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="slug" label="标识" min-width="140" show-overflow-tooltip />
      <el-table-column label="分类" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.category || '未分类' }}</template>
      </el-table-column>
      <el-table-column label="价格文案" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.price_text || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="92" align="center">
        <template #default="{ row }">
          <el-tag :type="(STATE_TAG[row.state as ProductAdminRow['state']] as any) || 'info'" size="small">{{ row.state_text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sort" label="排序" width="72" align="center" />
      <el-table-column label="修改人" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.updated_by_name || '—' }}</template>
      </el-table-column>
      <el-table-column label="修改时间" width="160">
        <template #default="{ row }">{{ fmt(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="上架时间" width="160">
        <template #default="{ row }">{{ fmt(row.published_at) }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row)">{{ row.origin === 'online' ? '查看' : (canWrite ? '编辑' : '查看') }}</el-button>
          <el-button v-if="canWrite && row.origin === 'draft'" link type="success" @click="publish(row)">发布</el-button>
          <el-button v-if="canWrite && row.origin === 'online'" link type="warning" @click="unpublish(row)">下架</el-button>
          <el-button v-if="canWrite && row.origin === 'online'" link @click="openSort(row)">调整排序</el-button>
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

    <el-dialog v-model="sortDlg" title="调整列表排序" width="380px">
      <div v-if="sortRow" class="pc-sort">
        <p class="pc-sort-hd">{{ sortRow.name }}<span class="pc-sort-slug">/product/{{ sortRow.slug }}</span></p>
        <el-form-item label="排序值">
          <el-input-number v-model="sortValue" :min="0" :max="999999" />
        </el-form-item>
        <p class="pc-sort-tip">数值越小越靠前。只改官网列表顺序，产品内容、状态与上架时间都不动。</p>
      </div>
      <template #footer>
        <el-button @click="sortDlg = false">取消</el-button>
        <el-button type="primary" :loading="sortSaving" @click="submitSort">保存</el-button>
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
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f7fa;
  display: block;
}
.pc-name {
  font-weight: 500;
}
.pc-series {
  font-size: 12px;
  color: #909399;
}
.pc-sort-hd {
  margin: 0 0 12px;
  font-weight: 600;
}
.pc-sort-slug {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.pc-sort-tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: #909399;
}
</style>
