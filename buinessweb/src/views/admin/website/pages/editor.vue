<script setup lang="ts">
/**
 * 页面装修编辑器（核心）：三栏布局
 *   左：区块列表（新增/删除/上下移/显隐/选中）
 *   中：内容表单（按 sectionRegistry.formSchema 通用渲染 BlockForm）
 *   顶栏：保存草稿 / 发布（先存草稿再发布）/ 下线 / 页面信息 meta / 返回
 *   右：实时预览（SectionRenderer 渲染草稿 blocks，website.css 定宽缩放）
 * 数据源：GET /pages/by-slug/:slug，优先取 draft_json（有区块），否则 content_json，否则内置默认。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { Page } from '@/types/cms';
import { parseBlocks, genBlockId, moveBlock, removeBlock, insertBlock, type Block } from '@/website/blocks';
import { defaultBlocks } from '@/website/pageDefaults';
import { SECTION_REGISTRY, SECTION_GROUPS, sectionLabel } from '@/website/sectionRegistry';
import SectionRenderer from '@/website/SectionRenderer.vue';
import BlockForm from '../components/BlockForm.vue';

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug || '');

const page = ref<Page | null>(null);
const blocks = ref<Block[]>([]);
const selIdx = ref(-1);
const dirty = ref(false);
const loading = ref(false);
const saving = ref(false);

const selected = computed<Block | null>(() => (selIdx.value >= 0 ? blocks.value[selIdx.value] ?? null : null));
const selectedMeta = computed(() => (selected.value ? SECTION_REGISTRY[selected.value.type] : null));

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.pages.bySlug(slug);
    page.value = res;
    const draft = parseBlocks(res.draft_json);
    const live = parseBlocks(res.content_json);
    blocks.value = draft.length ? draft : live.length ? live : defaultBlocks(slug);
    selIdx.value = blocks.value.length ? 0 : -1;
    // 初始化完成后清脏标记（deep watch 在赋值时已触发）
    setTimeout(() => (dirty.value = false), 0);
  } catch (e: any) {
    ElMessage.error(e?.message || '页面加载失败');
    // 接口异常时仍可基于内置默认内容编辑（保存会写回该页面草稿）
    blocks.value = defaultBlocks(slug);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

watch(blocks, () => (dirty.value = true), { deep: true });

// ---- 区块操作 ----
function move(i: number, delta: number) {
  blocks.value = moveBlock(blocks.value, i, delta);
  if (selIdx.value === i) selIdx.value = i + delta;
  else if (selIdx.value === i + delta) selIdx.value = i;
}
function removeAt(i: number) {
  if (!window.confirm('确认删除该区块？')) return;
  blocks.value = removeBlock(blocks.value, i);
  selIdx.value = Math.min(selIdx.value, blocks.value.length - 1);
  if (selIdx.value >= blocks.value.length) selIdx.value = blocks.value.length - 1;
}
function toggleVisible(b: Block) {
  b.visible = !b.visible;
}

// ---- 新增区块（按分组选择注册表类型） ----
const addVisible = ref(false);
const groupedTypes = computed(() =>
  SECTION_GROUPS.map((g) => ({
    group: g,
    types: Object.entries(SECTION_REGISTRY).filter(([, meta]) => meta.group === g),
  })).filter((x) => x.types.length)
);
function addBlock(type: string) {
  const meta = SECTION_REGISTRY[type];
  if (!meta) return;
  const block: Block = {
    id: genBlockId(type),
    type,
    visible: true,
    props: JSON.parse(JSON.stringify(meta.defaultProps())),
  };
  const at = selIdx.value >= 0 ? selIdx.value + 1 : blocks.value.length;
  blocks.value = insertBlock(blocks.value, at, block);
  selIdx.value = at;
  addVisible.value = false;
}

// ---- 保存 / 发布 / 下线 ----
async function saveDraft(silent = false): Promise<boolean> {
  if (!page.value) {
    ElMessage.warning('页面尚未创建成功，无法保存');
    return false;
  }
  saving.value = true;
  try {
    await cmsAdmin.pages.saveDraft(page.value.id, { blocks: blocks.value });
    dirty.value = false;
    if (!silent) ElMessage.success('草稿已保存');
    return true;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
    return false;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('发布后草稿内容将立即覆盖官网线上版本，确认发布？', '发布确认', { type: 'warning' });
  } catch {
    return;
  }
  if (!(await saveDraft(true))) return;
  try {
    await cmsAdmin.pages.publish(page.value.id);
    page.value.status = 1;
    ElMessage.success('已发布，官网即时生效');
  } catch (e: any) {
    ElMessage.error(e?.message || '发布失败');
  }
}

// 放弃草稿：清空 draft_json 并重载，编辑器回落到官网线上版本
async function discardDraft() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('放弃草稿后未发布的修改全部丢失，编辑器将回落到官网线上版本，确认放弃？', '放弃草稿', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await cmsAdmin.pages.discardDraft(page.value.id);
    await load();
    ElMessage.success('草稿已放弃，当前显示线上版本');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

async function unpublish() {
  if (!page.value) return;
  try {
    await ElMessageBox.confirm('下线后官网将不再展示该页面，确认下线？', '下线确认', { type: 'warning' });
    await cmsAdmin.pages.unpublish(page.value.id);
    page.value.status = 0;
    ElMessage.success('已下线');
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// ---- 页面信息（SEO meta） ----
const metaVisible = ref(false);
const metaForm = ref({ title: '', metaTitle: '', metaDescription: '', heroImage: '' });
function openMeta() {
  const p = page.value;
  metaForm.value = {
    title: p?.title || '',
    metaTitle: p?.meta_title || '',
    metaDescription: p?.meta_description || '',
    heroImage: p?.hero_image || '',
  };
  metaVisible.value = true;
}
async function saveMeta() {
  if (!page.value) return;
  try {
    await cmsAdmin.pages.updateMeta(page.value.id, {
      title: metaForm.value.title,
      metaTitle: metaForm.value.metaTitle,
      metaDescription: metaForm.value.metaDescription,
      heroImage: metaForm.value.heroImage,
    });
    page.value.title = metaForm.value.title;
    page.value.meta_title = metaForm.value.metaTitle;
    page.value.meta_description = metaForm.value.metaDescription;
    page.value.hero_image = metaForm.value.heroImage;
    metaVisible.value = false;
    ElMessage.success('页面信息已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  }
}

// ---- 预览缩放 ----
const scale = ref(0.5);
const SCALE_OPTIONS = [
  { label: '50%', value: 0.5 },
  { label: '60%', value: 0.6 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
];

function goBack() {
  if (dirty.value && !window.confirm('有未保存的草稿修改，确认离开？')) return;
  router.push('/admin');
}
</script>

<template>
  <div class="editor" v-loading="loading">
    <!-- 顶栏 -->
    <div class="ed-topbar">
      <div class="ed-left">
        <el-button link @click="goBack">← 返回列表</el-button>
        <span class="ed-title">{{ page?.title || slug }}</span>
        <code class="ed-slug">{{ slug }}</code>
        <el-tag :type="page?.status === 1 ? 'success' : 'info'" size="small">
          {{ page?.status === 1 ? '已发布' : '未发布' }}
        </el-tag>
        <el-tag v-if="dirty" type="warning" size="small">草稿未保存</el-tag>
      </div>
      <div class="ed-right">
        <el-select v-model="scale" size="small" style="width: 90px">
          <el-option v-for="op in SCALE_OPTIONS" :key="op.value" :label="`预览 ${op.label}`" :value="op.value" />
        </el-select>
        <el-button @click="openMeta">页面信息</el-button>
        <el-button :loading="saving" @click="saveDraft()">保存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="publish">发布</el-button>
        <el-button type="warning" plain :disabled="page?.status !== 1" @click="unpublish">下线</el-button>
        <el-button link @click="discardDraft">放弃草稿</el-button>
      </div>
    </div>

    <div class="ed-body">
      <!-- 左：区块列表 -->
      <div class="ed-col ed-blocks">
        <div class="ed-col-head">
          <span>区块（{{ blocks.length }}）</span>
          <el-button size="small" type="primary" plain @click="addVisible = true">+ 添加区块</el-button>
        </div>
        <div class="ed-block-list">
          <div
            v-for="(b, i) in blocks"
            :key="`${b.id}-${i}`"
            class="ed-block-item"
            :class="{ active: i === selIdx, hidden: !b.visible }"
            @click="selIdx = Number(i)"
          >
            <span class="eb-idx">{{ Number(i) + 1 }}</span>
            <span class="eb-label">{{ sectionLabel(b.type) }}</span>
            <span class="eb-ops" @click.stop>
              <el-button link size="small" :title="b.visible ? '点击隐藏' : '点击显示'" @click="toggleVisible(b)">
                {{ b.visible ? '👁' : '◡' }}
              </el-button>
              <el-button link size="small" :disabled="i === 0" @click="move(Number(i), -1)">↑</el-button>
              <el-button link size="small" :disabled="i === blocks.length - 1" @click="move(Number(i), 1)">↓</el-button>
              <el-button link size="small" type="danger" @click="removeAt(Number(i))">✕</el-button>
            </span>
          </div>
          <el-empty v-if="!blocks.length" description="空页面，点击「添加区块」开始装修" :image-size="60" />
        </div>
      </div>

      <!-- 中：内容表单 -->
      <div class="ed-col ed-form">
        <div class="ed-col-head">
          <span>内容编辑</span>
          <span v-if="selected" class="ed-form-type">{{ selectedMeta?.label }}（{{ selected.type }}）</span>
        </div>
        <div class="ed-form-body">
          <template v-if="selected && selectedMeta">
            <!-- key 保证切换区块时重建表单（初始化逻辑只在 setup 执行一次） -->
            <BlockForm :key="`${selected.id}-${selIdx}`" :schema="selectedMeta.formSchema" :model="selected.props" />
          </template>
          <el-empty v-else description="从左侧选择一个区块开始编辑" :image-size="80" />
        </div>
      </div>

      <!-- 右：实时预览 -->
      <div class="ed-col ed-preview">
        <div class="ed-col-head">
          <span>实时预览（草稿）</span>
          <a class="ed-open" :href="slug === 'home' ? '/' : `/${slug}`" target="_blank">查看线上 ↗</a>
        </div>
        <div class="ed-canvas-wrap">
          <div class="ed-canvas web-scope" :style="{ transform: `scale(${scale})` }">
            <SectionRenderer :blocks="blocks" preview />
          </div>
        </div>
      </div>
    </div>

    <!-- 添加区块弹窗 -->
    <el-dialog v-model="addVisible" title="添加区块" width="640px">
      <div v-for="g in groupedTypes" :key="g.group" class="add-group">
        <div class="add-group-title">{{ g.group }}</div>
        <div class="add-grid">
          <div v-for="[type, meta] in g.types" :key="type" class="add-cell" @click="addBlock(type)">
            {{ meta.label }}
            <small>{{ type }}</small>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 页面信息弹窗 -->
    <el-dialog v-model="metaVisible" title="页面信息（SEO / Meta）" width="520px">
      <el-form label-width="110px">
        <el-form-item label="页面标题">
          <el-input v-model="metaForm.title" placeholder="导航与列表展示标题" />
        </el-form-item>
        <el-form-item label="SEO 标题">
          <el-input v-model="metaForm.metaTitle" placeholder="留空使用页面标题" />
        </el-form-item>
        <el-form-item label="SEO 描述">
          <el-input v-model="metaForm.metaDescription" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="分享图 URL">
          <el-input v-model="metaForm.heroImage" placeholder="og:image 等分享配图" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="metaVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMeta">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 预览需官网样式：@import 由浏览器解析、不受 scoped 影响（与 WebsiteLayout 同法） */
@import url('@/assets/website.css');

.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 640px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.ed-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
  flex-wrap: wrap;
}
.ed-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ed-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ed-title {
  font-size: 15px;
  font-weight: 600;
}
.ed-slug {
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}
.ed-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px minmax(340px, 420px) 1fr;
  min-height: 0;
}
.ed-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.ed-col + .ed-col {
  border-left: 1px solid #ebeef5;
}
.ed-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f2f5;
  background: #fcfcfd;
}
.ed-form-type {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.ed-open {
  font-weight: 400;
  font-size: 12px;
  color: var(--el-color-primary);
  text-decoration: none;
}
/* 左栏 */
.ed-block-list {
  flex: 1;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ed-block-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.12s;
}
.ed-block-item:hover {
  border-color: #c0c4cc;
}
.ed-block-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.ed-block-item.hidden .eb-label {
  color: #c0c4cc;
  text-decoration: line-through;
}
.eb-idx {
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background: #f0f2f5;
  font-size: 11px;
  color: #909399;
  flex: none;
}
.eb-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.eb-ops {
  display: flex;
  align-items: center;
  flex: none;
}
.eb-ops .el-button + .el-button {
  margin-left: 2px;
}
/* 中栏 */
.ed-form-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
/* 右栏预览：定宽 1280 画布 + transform 缩放 */
.ed-canvas-wrap {
  flex: 1;
  overflow: auto;
  background: #eef1f5;
  padding: 16px;
}
.ed-canvas {
  width: 1280px;
  transform-origin: top left;
  background: #fff;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
}
/* 添加区块弹窗 */
.add-group {
  margin-bottom: 16px;
}
.add-group-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}
.add-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.add-cell {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: all 0.12s;
}
.add-cell:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.add-cell small {
  color: #a8abb2;
  font-size: 11px;
}
</style>
