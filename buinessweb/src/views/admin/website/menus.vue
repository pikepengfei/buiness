<script setup lang="ts">
/**
 * 导航菜单管理：按导航位分区——顶部导航 / 右上角按钮（CTA）/ 页脚分组及其子项
 *
 * 顶部导航与 CTA 的固定六行由代码预置；「新增顶部导航页面」是新建页面的唯一入口，
 * 使用 CreatePageDialog（页面记录 + 顶栏行同事务落库，创建后进入装修编辑器），
 * 「页面装修」页只做装修、发布、下线、删除。
 * 删除规则：固定导航行恒不可删；页面已发布的顶栏行不可删（先到「页面装修」下线）；
 * 未发布页面的顶栏行可删（仅移除导航栏目，页面内容保留在页面装修，可另行删除）。
 * 页脚分组与子项仍由本页自由维护。
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { MenuItem, PageListRow } from '@/types/cms';
import { isFixedPage } from '@/website/pageRoutes';
import CreatePageDialog from '@/views/admin/website/components/CreatePageDialog.vue';

type NavLocation = 'header' | 'footer' | 'cta';

const tree = ref<MenuItem[]>([]);
const loading = ref(false);
// 页面装修侧的页面状态（slug → 行），用于判断顶栏行对应页面是否已发布
const pageBySlug = ref<Map<string, PageListRow>>(new Map());

// 后端 GET /menus 不按 location 过滤，三棵子树混在同一棵树里，此处按导航位分区展示
const headerRows = computed(() => tree.value.filter((n) => n.location === 'header'));
const ctaRows = computed(() => tree.value.filter((n) => n.location === 'cta'));
const footerRows = computed(() => tree.value.filter((n) => n.location === 'footer'));

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
async function loadPages() {
  try {
    const res = await cmsAdmin.pages.list();
    pageBySlug.value = new Map(res.list.map((p) => [p.slug, p]));
  } catch {
    // 拉不到页面列表时删除按钮按「未知」禁用处理，后端仍有兜底校验
    pageBySlug.value = new Map();
  }
}
onMounted(() => {
  load();
  loadPages();
});

const dlg = ref(false);
const saving = ref(false);
const editId = ref<number | null>(null);
const dlgLoc = ref<NavLocation>('header');
const form = ref<any>({});

const dlgTitle = computed(() => {
  if (editId.value != null) return '编辑菜单';
  if (form.value.parentId) return '新增页脚链接';
  if (dlgLoc.value === 'footer') return '新增页脚分组';
  if (dlgLoc.value === 'cta') return '新增右上角按钮';
  return '新增顶级菜单';
});

function openCreate(loc: NavLocation, parent?: MenuItem) {
  editId.value = null;
  dlgLoc.value = loc;
  form.value = { parentId: parent?.id ?? null, title: '', url: '', target: '_self', sort: 0, status: 1 };
  dlg.value = true;
}
function openEdit(row: MenuItem) {
  editId.value = row.id;
  dlgLoc.value = row.location as NavLocation;
  form.value = { parentId: row.parent_id, title: row.title, url: row.url ?? '', target: row.target, sort: row.sort, status: row.status };
  dlg.value = true;
}
async function submit() {
  const title = (form.value.title ?? '').trim();
  const url = (form.value.url ?? '').trim();
  // 页脚分组的标题是列名，本身不是链接，允许留空；其余导航位必须可点击
  const urlOptional = dlgLoc.value === 'footer' && !form.value.parentId;
  if (!title) {
    ElMessage.warning('请填写名称');
    return;
  }
  if (!url && !urlOptional) {
    ElMessage.warning('请填写导航链接（仅页脚分组标题可留空）');
    return;
  }
  saving.value = true;
  // 顶部导航与 CTA 是固定项：只提交名称与显隐，链接/位置/打开方式/排序一律不开放
  const body: Record<string, any> = dlgLoc.value === 'footer'
    ? { title, url, target: form.value.target, sort: form.value.sort, status: form.value.status }
    : { title, status: form.value.status };
  if (form.value.parentId) body.parentId = form.value.parentId;
  // 顶级新增需指明导航位，否则后端默认落到 header；子项的位置由父级决定，不传
  if (editId.value == null && !form.value.parentId) body.location = dlgLoc.value;
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

// ---- 顶部导航的删除规则 ----
// 顶栏行 url → 页面 slug（首页行 url 为 '/'，对应固定页 home）
function slugOfMenu(row: MenuItem): string {
  return row.url === '/' ? 'home' : (row.url ?? '').replace(/^\//, '');
}
function isFixedMenu(row: MenuItem): boolean {
  return isFixedPage(slugOfMenu(row));
}
function isPagePublished(row: MenuItem): boolean {
  return pageBySlug.value.get(slugOfMenu(row))?.status === 1;
}
/** 顶栏行不可删除时的原因文案；空串表示可删除 */
function headerDelTip(row: MenuItem): string {
  if (isFixedMenu(row)) return '固定导航项由代码维护，不可删除';
  if (isPagePublished(row)) return '页面已发布，请先在「页面装修」下线后再删除';
  return '';
}
async function removeHeader(row: MenuItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除顶部导航「${row.title}」？仅移除导航栏目，页面内容仍保留在「页面装修」。`,
      '删除确认', { type: 'warning' });
    await cmsAdmin.menus.remove(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// ---- 新增顶部导航页面（唯一新建入口）----
// 使用 CreatePageDialog：创建页面时同事务生成顶栏行，创建后进入装修编辑器；
// 本页仅在 created 事件里刷新菜单树与页面状态。
const createPageVisible = ref(false);
function onPageCreated() {
  load();
  loadPages();
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="hd">
        <span class="hd-t">导航菜单</span>
        <el-button @click="load">刷新</el-button>
      </div>
    </template>
    <el-alert type="info" :closable="false" show-icon class="tip">
      固定导航项（首页/关于我们/产品中心/新闻资讯/售后服务）与右上角按钮由代码维护，只能改名与显隐；
      「新增顶部导航页面」是新建页面的唯一入口：创建页面时同步生成本栏目与 /{标识} 地址，
      创建后直接进入装修编辑器；装修、发布、下线在「页面装修」页进行。
      页面已发布时其导航不可删除，需先在「页面装修」下线；页脚分组仍在此维护。
    </el-alert>

    <!-- ===================== 顶部导航 ===================== -->
    <div class="sec">
      <div class="sec-hd">
        <div class="sec-hd-l">
          <span class="sec-t">顶部导航</span>
          <span class="sec-hint">页面已发布时导航不可删除，需先在「页面装修」下线</span>
        </div>
        <el-button type="primary" @click="createPageVisible = true">新增顶部导航页面</el-button>
      </div>
      <el-table v-loading="loading" :data="headerRows" row-key="id">
        <el-table-column prop="title" label="名称" min-width="200" />
        <el-table-column prop="url" label="链接" min-width="200" />
        <el-table-column prop="target" label="打开方式" width="110" />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ops-col" width="240" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <!-- 顶部导航不提供子项（官网顶栏不再渲染下拉）。恢复时加回下面这行即可：
            <el-button link @click="openCreate('header', row)">加子项</el-button>
            -->
            <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
            <el-button v-if="!headerDelTip(row)" link type="danger" @click="removeHeader(row)">删除</el-button>
            <el-button v-else link type="danger" disabled :title="headerDelTip(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ===================== 右上角按钮 ===================== -->
    <div class="sec">
      <div class="sec-hd">
        <span class="sec-t">右上角按钮</span>
        <span class="sec-hint">固定项，仅可改名与显隐</span>
      </div>
      <div class="sec-tip">官网顶栏右上角只渲染启用中的第一条，请勿保留多条启用。</div>
      <el-table :data="ctaRows" row-key="id">
        <el-table-column prop="title" label="名称" min-width="200" />
        <el-table-column prop="url" label="链接" min-width="200" />
        <el-table-column prop="target" label="打开方式" width="110" />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ops-col" width="240" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" disabled title="固定项不可删除">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- ===================== 页脚分组与子项 ===================== -->
    <div class="sec">
      <div class="sec-hd">
        <span class="sec-t">页脚分组与子项</span>
        <el-button type="primary" @click="openCreate('footer')">新增分组</el-button>
      </div>
      <div class="sec-tip">分组标题即页脚列名（链接留空），其下子项是该列中的可点击链接。</div>
      <el-table :data="footerRows" row-key="id" default-expand-all :tree-props="{ children: 'children' }">
        <el-table-column prop="title" label="名称" min-width="200" />
        <el-table-column label="链接" min-width="200">
          <template #default="{ row }">{{ row.url || '—（分组标题）' }}</template>
        </el-table-column>
        <el-table-column prop="target" label="打开方式" width="110" />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ops-col" width="300" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="!row.parent_id" link @click="openCreate('footer', row)">加子项</el-button>
            <el-button link @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" :title="dlgTitle" width="520px">
      <el-form label-width="90px">
        <el-form-item label="上级">
          <el-input :model-value="form.parentId ? `ID ${form.parentId}` : '顶级菜单'" disabled />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.title" placeholder="导航显示文字，如：产品中心" />
        </el-form-item>
        <el-form-item label="链接">
          <el-input v-model="form.url" :disabled="dlgLoc !== 'footer'" :placeholder="dlgLoc === 'footer' && !form.parentId ? '分组标题可留空' : '如：/products'" />
          <div v-if="dlgLoc !== 'footer'" class="ro-tip">顶部导航与 CTA 的链接由代码或页面流程维护，不可修改</div>
        </el-form-item>
        <el-form-item label="打开方式">
          <el-radio-group v-model="form.target" :disabled="dlgLoc !== 'footer'">
            <el-radio value="_self">当前窗口</el-radio>
            <el-radio value="_blank">新窗口</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" :disabled="dlgLoc !== 'footer'" />
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

    <!-- 新建页面唯一入口：创建页面 + 顶栏行（后端同事务），创建后进入装修编辑器 -->
    <CreatePageDialog v-model="createPageVisible" @created="onPageCreated" />
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
.sec-hint {
  color: #909399;
  font-size: 12px;
}
.ro-tip {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
.sec {
  margin-top: 20px;
}
.sec-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sec-hd-l {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sec-t {
  font-weight: 600;
}
.sec-tip {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
