<script setup lang="ts">
/**
 * 区块模板库面板（decoration-editor-toolkit）：挂在组件库抽屉的「模板库」标签页
 * - 列表：关键词 + 类型过滤 + 分页；卡片用 LibraryCard 真实渲染模板自身内容（非默认骨架）
 * - 存为模板：对编辑器当前选中区块命名入库（重名可二次确认覆盖既有模板）
 * - 从模板插入：emit 给编辑器，由编辑器按 moduleTarget / atomTarget 插入并做结构护栏校验
 * - 管理：改名 / 删除（二次确认）
 * - 铺默认内容入口：仅当该页类型存在默认区块集时显示，实际追加动作由编辑器执行
 * 只读账号（canWrite=false）可浏览但全部写动作禁用（B4，与组件库 rejectReason 同模式）
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import type { BlockTemplate } from '@/types/cms';
import type { Block, InsertTarget } from '@/website/blocks';
import { checkInsert, isTemplateUsable, mergeBlockProps } from '@/website/blocks';
import { blockLayer, insertRejectReason, SECTION_REGISTRY, sectionLabel } from '@/website/sectionRegistry';
import LibraryCard from './LibraryCard.vue';

const props = defineProps<{
  blocks: Block[];
  canWrite: boolean;
  /** 模块模板的插入目标（页面顶层） */
  moduleTarget: InsertTarget;
  /** 基础元素模板的插入目标（选中模块的子内容）；null 表示当前没有可装载的模块 */
  atomTarget: InsertTarget | null;
  parentType?: string;
  /** 编辑器当前单选区块（存为模板的内容来源；null 时存入口禁用） */
  selectedBlock: Block | null;
  /** 该页类型是否存在默认区块集（defaultBlocks(slug) 非空） */
  defaultAvailable: boolean;
}>();

const emit = defineEmits<{
  (e: 'insert-template', template: BlockTemplate): void;
  (e: 'apply-defaults'): void;
}>();

const loading = ref(false);
const items = ref<BlockTemplate[]>([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 12;
const keyword = ref('');
const typeFilter = ref('');

/** 类型过滤选项：注册表里的模块与基础元素（模板可存任意已注册类型，B1 双层） */
const typeOptions = computed(() =>
  Object.entries(SECTION_REGISTRY)
    .map(([type, meta]) => ({ value: type, label: `${meta.label}（${type}）` }))
    .sort((a, b) => a.label.localeCompare(b.label))
);

async function load() {
  loading.value = true;
  try {
    const res = await cmsAdmin.blockTemplates.list({
      page: page.value,
      pageSize: PAGE_SIZE,
      keyword: keyword.value.trim() || undefined,
      type: typeFilter.value || undefined,
    });
    items.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    ElMessage.error(e?.message || '模板列表加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function handleSearch() {
  page.value = 1;
  await load();
}
async function handlePageChange(p: number) {
  page.value = p;
  await load();
}

/** 依据权限 / 类型可用性 / 插入目标 / 结构上限给出不可插入原因（B4 同模式） */
function rejectReason(tpl: BlockTemplate): string | undefined {
  if (!isTemplateUsable(tpl.type)) return '类型已下线';
  if (!props.canWrite) return '当前账号只有内容查看权限';
  const layer = blockLayer(tpl.type);
  const target = layer === 'atom' ? props.atomTarget : props.moduleTarget;
  if (!target) return '请先在左侧选中一个可装载子内容的模块';
  if (layer === 'atom' && props.parentType) {
    const why = insertRejectReason(props.parentType, 'atom');
    if (why) return why;
  }
  const probe: Block = { id: `probe-${tpl.type}`, type: tpl.type, visible: true, props: mergeBlockProps(tpl.type, tpl.props) };
  return checkInsert(props.blocks, probe, target);
}

/** 模板自身的渲染块（预览真实内容）；类型下线的模板不传 blocks，避免渲染未注册类型 */
function previewBlocks(tpl: BlockTemplate): Block[] | undefined {
  if (!isTemplateUsable(tpl.type)) return undefined;
  return [{ id: `tpl-${tpl.id}`, type: tpl.type, visible: true, props: mergeBlockProps(tpl.type, tpl.props) }];
}

function onPick(tpl: BlockTemplate) {
  if (rejectReason(tpl)) return;
  emit('insert-template', tpl);
}

// ---- 存为模板（4.3 / B2 重名覆盖） ----
const saveVisible = ref(false);
const saveName = ref('');
const saving = ref(false);

/** 默认名建议：区块标题（取常见标题字段的第一个非空行），否则类型中文名 */
function suggestedName(b: Block): string {
  const p = b.props ?? {};
  const title = p.title;
  const first = Array.isArray(title) ? title.find((t: unknown) => String(t ?? '').trim()) : title;
  const text = String(first ?? '').trim();
  if (text) return text.slice(0, 40);
  const name = String(p.name ?? '').trim();
  if (name) return name.slice(0, 40);
  return sectionLabel(b.type);
}

function openSave() {
  if (!props.selectedBlock || !props.canWrite) return;
  saveName.value = suggestedName(props.selectedBlock);
  saveVisible.value = true;
}

async function submitSave() {
  const src = props.selectedBlock;
  if (!src) return;
  const name = saveName.value.trim();
  if (!name) {
    ElMessage.warning('请填写模板名称');
    return;
  }
  saving.value = true;
  try {
    const body = { name, type: src.type, props: src.props };
    await cmsAdmin.blockTemplates.create(body);
    ElMessage.success('已存为模板');
    saveVisible.value = false;
    await load();
  } catch (e: any) {
    const msg = String(e?.message || '保存失败');
    // 重名冲突（B2）：同类型同名已存在 → 二次确认后覆盖既有模板（整份重写 name/type/props）
    if (msg.includes('已存在')) {
      const existed = items.value.find((t) => t.name === name && t.type === src.type);
      if (existed) {
        try {
          await ElMessageBox.confirm(
            `同类型已存在同名模板「${name}」，覆盖将重写其内容，确认覆盖？`,
            '覆盖既有模板',
            { type: 'warning', confirmButtonText: '覆盖', cancelButtonText: '取消' }
          );
        } catch {
          return; // 用户取消覆盖：保留弹窗与已填名称，供改名再试
        }
        try {
          await cmsAdmin.blockTemplates.update(existed.id, { name, type: src.type, props: src.props });
          ElMessage.success('已覆盖既有模板');
          saveVisible.value = false;
          await load();
        } catch (e2: any) {
          ElMessage.error(e2?.message || '覆盖失败');
        }
        return;
      }
    }
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}

// ---- 管理：改名 / 删除（二次确认） ----
const renameVisible = ref(false);
const renameTarget = ref<BlockTemplate | null>(null);
const renameName = ref('');

function openRename(tpl: BlockTemplate) {
  renameTarget.value = tpl;
  renameName.value = tpl.name;
  renameVisible.value = true;
}

async function submitRename() {
  const tpl = renameTarget.value;
  if (!tpl) return;
  const name = renameName.value.trim();
  if (!name) {
    ElMessage.warning('请填写模板名称');
    return;
  }
  try {
    await cmsAdmin.blockTemplates.update(tpl.id, { name });
    ElMessage.success('已改名');
    renameVisible.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '改名失败');
  }
}

async function handleRemove(tpl: BlockTemplate) {
  try {
    await ElMessageBox.confirm(
      `确认删除模板「${tpl.name}」？已插入到页面的区块不受任何影响，仅模板库少一个选项。`,
      '删除模板',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  try {
    await cmsAdmin.blockTemplates.remove(tpl.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  }
}

function onApplyDefaults() {
  if (!props.canWrite) return;
  emit('apply-defaults');
}

function formatBytes(n?: number): string {
  if (!n) return '';
  return n > 1024 ? `${Math.round(n / 1024)}KB` : `${n}B`;
}
</script>

<template>
  <div class="tpl">
    <div class="tpl-toolbar">
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索模板名称"
        clearable
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select
        v-model="typeFilter"
        size="small"
        placeholder="全部类型"
        clearable
        filterable
        @change="handleSearch"
      >
        <el-option v-for="op in typeOptions" :key="op.value" :label="op.label" :value="op.value" />
      </el-select>
      <el-button size="small" type="primary" :disabled="!canWrite || !selectedBlock" @click="openSave">
        存为模板
      </el-button>
      <el-button
        v-if="defaultAvailable"
        size="small"
        plain
        :disabled="!canWrite"
        title="把该页面类型的默认区块追加到当前草稿之后"
        @click="onApplyDefaults"
      >
        铺入默认内容
      </el-button>
    </div>

    <div class="tpl-body" v-loading="loading">
      <el-alert
        v-if="!canWrite"
        type="info"
        :closable="false"
        show-icon
        title="只读模式"
        description="当前账号没有内容写权限，模板库可浏览但不可插入与管理"
      />
      <div v-for="tpl in items" :key="tpl.id" class="tpl-item">
        <LibraryCard
          :item="{ type: tpl.type, label: tpl.name, group: sectionLabel(tpl.type), reason: rejectReason(tpl) }"
          :blocks="previewBlocks(tpl)"
          @pick="() => onPick(tpl)"
        />
        <div class="tpl-meta">
          <span class="tpl-meta-text">
            {{ tpl.created_by_name || '未知' }} · {{ tpl.created_at?.slice(0, 10) }}
            <em v-if="formatBytes(tpl.props_bytes)" class="tpl-size">{{ formatBytes(tpl.props_bytes) }}</em>
          </span>
          <span v-if="canWrite" class="tpl-meta-ops" @click.stop>
            <el-button link size="small" @click="openRename(tpl)">改名</el-button>
            <el-button link size="small" type="danger" @click="handleRemove(tpl)">删除</el-button>
          </span>
        </div>
      </div>
      <el-empty v-if="!loading && !items.length" description="暂无模板；选中区块后点「存为模板」积累复用资产" :image-size="60" />
      <el-pagination
        v-if="total > PAGE_SIZE"
        layout="prev, pager, next"
        small
        :total="total"
        :page-size="PAGE_SIZE"
        :current-page="page"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 存为模板：命名 + 默认名建议 -->
    <el-dialog v-model="saveVisible" title="存为模板" width="420px">
      <el-form label-width="90px">
        <el-form-item label="模板名称">
          <el-input v-model="saveName" maxlength="80" placeholder="建议用「区块标题」或类型中文名" />
        </el-form-item>
        <el-form-item label="类型">
          <el-input :model-value="sectionLabel(selectedBlock?.type || '')" disabled />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          title="模板只保存该区块自身内容，模块内子内容不随模板入库"
        />
      </el-form>
      <template #footer>
        <el-button @click="saveVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 改名 -->
    <el-dialog v-model="renameVisible" title="模板改名" width="420px">
      <el-input v-model="renameName" maxlength="80" placeholder="新的模板名称" />
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRename">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tpl {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 8px;
}
.tpl-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tpl-toolbar .el-select {
  width: 150px;
}
.tpl-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.tpl-item {
  margin-bottom: 6px;
}
.tpl-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #a8abb2;
  padding: 0 2px 6px;
}
.tpl-meta-text em.tpl-size {
  font-style: normal;
  margin-left: 6px;
}
.tpl-meta-ops {
  display: inline-flex;
}
</style>
