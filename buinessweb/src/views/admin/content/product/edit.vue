<script setup lang="ts">
/**
 * 产品编辑页（新增 / 编辑未上架内容 / 查看已上架内容）
 *
 * 一条产品同一时刻只存在于一张表，所以本页只有一个 id：
 * path 上的数字是线上表行 id（只读），query.draft 是未上架表行 id（可编辑、可上架、可删除）。
 * 已上架内容不可原地修改：要改内容只能先下架，界面上不给线上行留任何保存出口。
 * 每个写请求都带 uid（跨表稳定的内容身份标识），服务端据此拒绝「数字相同但不是同一条产品」的请求。
 * 表单编排留在本页，图集/规格/描述三块控件在同目录 components/ 下各自实现。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useAuthStore } from '@/stores/auth';
import { useTagsViewStore } from '@/stores/tagsView';
import type {
  AuditRow, ProductCategoryAdminRow, ProductDraftPayload, ProductEditable, ProductState,
} from '@/types/cms';
import MediaPicker from '../../website/components/MediaPicker.vue';
import GalleryEditor from './components/GalleryEditor.vue';
import SpecsEditor from './components/SpecsEditor.vue';
import DescriptionEditor from './components/DescriptionEditor.vue';

// 与 SpecsEditor 同名同形的本地声明：类型按结构匹配，两文件之间不做跨目录 import
type ProductSpec = { label: string; value: string };
type Form = {
  slug: string; name: string; categoryId: number | null; series: string; coverImage: string;
  gallery: string[]; summary: string; description: string; specs: ProductSpec[];
  highlights: string[]; priceText: string; buyLink: string; sort: number;
};
const emptyForm = (): Form => ({
  slug: '', name: '', categoryId: null, series: '', coverImage: '', gallery: [], summary: '',
  description: '', specs: [], highlights: [], priceText: '', buyLink: '', sort: 0,
});

// 标识格式与服务端同一条正则：不符合就地提示，不等请求回来再报错
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FORMAT_HINT = '只能由小写字母、数字与连字符组成，如 portable-ssd';
const HIGHLIGHT_MAX = 8;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const tagsView = useTagsViewStore();
// 服务端每个写端点都挂 content:write，这里只负责把入口收掉：只读账号看得到产品但按不出保存/上架
const canWrite = computed(() => auth.hasPerm('content:write'));

const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const cats = ref<ProductCategoryAdminRow[]>([]);

const form = ref<Form>(emptyForm());
// 单份语义：doc 就是这条产品当前所在的那一行，不存在「线上份 / 待上架份」同时在场
const doc = ref<ProductEditable | null>(null);
const uid = ref('');
const draftId = ref<number | null>(null);
const isOnline = computed(() => doc.value?.origin === 'online');
// 只读的两种来源：没有写权限，或这条产品正在官网上（必须先下架才能改）
const readOnly = computed(() => !canWrite.value || isOnline.value);
const noticeDismissed = ref(false);
const slugError = ref('');
// 与最近一次落库的表单快照比对：加载后不该显示「有未保存的编辑」，深监听 form 做不到这一点
const snapshot = ref(JSON.stringify(form.value));
// 用户是否已经动过表单：编辑器挂载时会把存量 HTML 规范化重写一遍（列表项补 <p>、属性换序），
// 那不是运营的编辑。落过第一次真实交互之前的重写一律并入快照，不进「有未保存的编辑」
const touched = ref(false);
// 最近一次落库的标识：只有它变了才需要弹「旧地址失效」的后果确认
const savedSlug = ref('');

const liveUrl = computed(() => `/product/${form.value.slug.trim()}`);
const hasSlug = computed(() => !!form.value.slug.trim());
const dirty = computed(() => snapshot.value !== JSON.stringify(form.value));

function markTouched() {
  touched.value = true;
}
/** 详细描述的唯一写入口：编辑器的规范化回写（还没人碰过表单）直接吸收进快照 */
function onDescription(v: string) {
  form.value.description = v;
  if (!touched.value) snapshot.value = JSON.stringify(form.value);
}
const slugBadFormat = computed(() =>
  !!form.value.slug.trim() && !SLUG_RE.test(form.value.slug.trim()));
// 服务端冲突（撞线上/撞草稿）优先于本地格式提示，两者不同时抢位置
const slugHint = computed(() => slugError.value || (slugBadFormat.value ? FORMAT_HINT : ''));
function routeIds() {
  const p = route.params.id ? Number(route.params.id) : null;
  const d = route.query.draft ? Number(route.query.draft) : null;
  return { p, d };
}

async function load() {
  const { p, d } = routeIds();
  loading.value = true;
  try {
    const list = await cmsAdmin.productCategories.list();
    cats.value = list.map((c) => ({ ...c, id: Number(c.id) }));
    // 两个端点各读自己那张表的行：path → 线上表，query.draft → 未上架表
    const row = p != null
      ? await cmsAdmin.products.getOnline(p)
      : (d != null ? await cmsAdmin.productDrafts.get(d) : null);
    doc.value = row;
    noticeDismissed.value = false;
    // 重新取数就是把内容重新交给编辑器规范化一次，吸收窗口要重新打开
    touched.value = false;
    if (!row) {
      uid.value = '';
      draftId.value = null;
      savedSlug.value = '';
      form.value = emptyForm();
      snapshot.value = JSON.stringify(form.value);
      return;
    }
    uid.value = row.uid;
    // 行 id 与分类 id 都是 BIGINT，驱动按字符串回传；统一转数字，寻址与下拉回填才不会被类型差拖住
    draftId.value = row.origin === 'draft' ? Number(row.id) : null;
    form.value = {
      slug: row.slug || '',
      name: row.name || '',
      categoryId: row.category_id == null ? null : Number(row.category_id),
      series: row.series || '',
      coverImage: row.cover_image || '',
      gallery: Array.isArray(row.gallery) ? [...row.gallery] : [],
      summary: row.summary || '',
      description: row.description || '',
      specs: row.specs.map((s) => ({ label: s.label, value: s.value })),
      highlights: Array.isArray(row.highlights) ? [...row.highlights] : [],
      priceText: row.price_text || '',
      buyLink: row.buy_link || '',
      sort: Number(row.sort ?? 0),
    };
    snapshot.value = JSON.stringify(form.value);
    savedSlug.value = row.slug || '';
    slugError.value = '';
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// 列表页切条目时组件被复用，只有 onMounted 不够；自身 replace 触发的变更跳过一次重载
let skipWatch = false;
watch(() => `${route.params.id}|${route.query.draft}`, () => {
  if (skipWatch) { skipWatch = false; return; }
  load();
});

function warnStripped(n: number) {
  if (n > 0) ElMessage.warning(`详细描述中 ${n} 张站外图片已被移除，请从素材库重新选取`);
}

function payload(): ProductDraftPayload {
  return {
    slug: form.value.slug.trim(),
    name: form.value.name.trim(),
    categoryId: form.value.categoryId ?? null,
    series: form.value.series.trim() || null,
    coverImage: form.value.coverImage.trim() || null,
    gallery: form.value.gallery.map((g) => g.trim()).filter(Boolean),
    summary: form.value.summary.trim() || null,
    // 描述以服务端清洗结果为准：这里原样提交编辑器产出的 HTML，不在本地剥一遍
    description: form.value.description || '',
    specs: form.value.specs
      .filter((s) => s.label.trim())
      .map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
    highlights: form.value.highlights.map((h) => h.trim()).filter(Boolean),
    priceText: form.value.priceText.trim() || null,
    buyLink: form.value.buyLink.trim() || null,
    sort: Number(form.value.sort) || 0,
  };
}

/** 落到未上架行：已有行 PATCH（带 uid 校验身份），没有行则新建并把 id 写回地址 */
async function persistDraft(): Promise<number | null> {
  const b = payload();
  if (draftId.value != null) {
    const r = await cmsAdmin.productDrafts.update(draftId.value, uid.value, b);
    warnStripped(r.stripped_images);
    return draftId.value;
  }
  const c = await cmsAdmin.productDrafts.create(b);
  uid.value = c.uid;
  draftId.value = Number(c.id);
  warnStripped(c.stripped_images);
  // 未上架行只能挂在 query 上：不写回地址，刷新就回到空白新增页，再存一次会多出一条草稿
  skipWatch = true;
  await router.replace({ query: { ...route.query, draft: String(c.id) } });
  return Number(c.id);
}

function validate(): boolean {
  slugError.value = '';
  if (!form.value.name.trim()) { ElMessage.warning('请填写产品名称'); return false; }
  if (!form.value.slug.trim()) { ElMessage.warning('请填写产品标识'); return false; }
  if (!SLUG_RE.test(form.value.slug.trim())) {
    slugError.value = FORMAT_HINT;
    return false;
  }
  if (form.value.specs.some((s) => !s.label.trim() && !!s.value.trim())) {
    ElMessage.warning('规格参数缺参数名：填了值的行必须有参数名');
    return false;
  }
  if (form.value.highlights.length > HIGHLIGHT_MAX) {
    ElMessage.warning(`卖点最多 ${HIGHLIGHT_MAX} 条`);
    return false;
  }
  return true;
}

/**
 * 改标识的后果确认（资讯链没有这条，本链按 spec 补上）：
 * 已落过库的条目换标识会让旧地址失效，运营常常以为「改名不影响链接」
 */
async function confirmSlugChange(): Promise<boolean> {
  const next = form.value.slug.trim();
  if (draftId.value == null || next === savedSlug.value) return true;
  try {
    await ElMessageBox.confirm(
      `标识将从 /product/${savedSlug.value} 改为 /product/${next}。`
      + '保存后旧地址立即失效，访客与外部已收录的链接会打到 404；'
      + '重新上架后新地址才在官网生效，已下架期间该地址本就不可访问。确认修改？',
      '修改标识的后果', { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '改回去' });
    return true;
  } catch {
    return false;
  }
}

async function saveDraft() {
  if (readOnly.value || !validate() || saving.value) return;
  if (!(await confirmSlugChange())) return;
  saving.value = true;
  try {
    await persistDraft();
    snapshot.value = JSON.stringify(form.value);
    savedSlug.value = form.value.slug.trim();
    ElMessage.success('已保存');
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '保存失败';
    if (e?.response?.status === 409) slugError.value = msg; // 唯一冲突就地提示，不只在右上角闪一下
    else ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}

/** 保存并发布 = 两次调用：先写未上架行，再把整行搬进线上表；搬运保留上架时间与排序值 */
async function saveAndPublish() {
  if (readOnly.value || !validate() || publishing.value) return;
  // 详细描述可以为空（与资讯正文不同），这里不设非空下限，只把清洗边界交给服务端
  if (!(await confirmSlugChange())) return;
  publishing.value = true;
  try {
    const id = await persistDraft();
    if (id == null) return;
    const res = await cmsAdmin.productDrafts.publish(id, uid.value);
    snapshot.value = JSON.stringify(form.value);
    savedSlug.value = form.value.slug.trim();
    skipWatch = true;
    await router.replace(`/admin/content/products/edit/${res.id}`);
    ElMessage.success(res.first_published
      ? '已上架到官网'
      : `已上架，首次上架时间 ${fmt(res.published_at)} 与排序值 ${res.sort} 一并延续`);
    await load();
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '上架失败';
    if (e?.response?.status === 409) slugError.value = msg;
    else ElMessage.error(msg);
  } finally {
    publishing.value = false;
  }
}

/** 去下架：整行搬回未上架侧，搬完直接进同一行 id 的可编辑形态（uid 不变，历史接着同一时间线） */
async function unpublishNow() {
  if (!doc.value || !canWrite.value) return;
  try {
    await ElMessageBox.confirm(
      `下架后官网立即不可访问，内容保留在未上架区，需重新发布才恢复；`
      + `该产品的官网地址 /product/${doc.value.slug} 立即失效。确认下架「${doc.value.name}」？`,
      '下架确认', { type: 'warning' });
    const res = await cmsAdmin.products.unpublish(doc.value.id, uid.value);
    ElMessage.success('已下架，现在可以修改了');
    skipWatch = true;
    await router.replace({ path: '/admin/content/products/edit', query: { draft: String(res.draft_id) } });
    await load();
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message);
  }
}

// ---------------- 修改记录（按 uid 查审计，跨两次换表仍是同一条时间线） ----------------
const historyVisible = ref(false);
const historyLoading = ref(false);
const history = ref<AuditRow[]>([]);
const ACTION_TEXT: Record<string, string> = {
  create: '新建', update: '保存', publish: '上架', unpublish: '下架', delete: '删除', sort: '调整排序',
};
const FIELD_TEXT: Record<string, string> = {
  slug: '标识', name: '名称', category_id: '分类', series: '系列', cover_image: '封面',
  gallery: '图集', summary: '摘要', description: '详细描述', specs: '规格参数',
  highlights: '卖点', price_text: '价格文案', buy_link: '购买链接', sort: '排序', state: '状态',
};
const STATE_TEXT: Record<ProductState | string, string> = {
  draft: '草稿', published: '已上架', offline: '已下架',
};

async function openHistory() {
  if (!uid.value) { ElMessage.info('产品保存后才有修改记录'); return; }
  historyVisible.value = true;
  historyLoading.value = true;
  try {
    const res = await cmsAdmin.audit.byProductUid(uid.value, { pageSize: 50 });
    history.value = res.list;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '修改记录加载失败');
  } finally {
    historyLoading.value = false;
  }
}

/** 一次改动的人类可读描述：长字段只带长度，三类形态列只带项数，不把整份内容摊进时间线 */
function digestText(col: string, side: Record<string, unknown> | undefined): string {
  const v = side?.[col];
  if (Array.isArray(v)) return `${v.length}`;
  if (col === 'description') return `${Number((v as { length?: number } | undefined)?.length ?? 0)} 字`;
  return v == null || v === '' ? '空' : String(v);
}
function changeText(r: AuditRow): string {
  const d = r.diff;
  if (!d || !d.fields?.length) return r.action === 'update' ? '未改动内容，仅刷新修改人' : '—';
  return d.fields.map((f) => {
    const label = FIELD_TEXT[f] || f;
    if (f === 'state') return `${label} ${STATE_TEXT[String(d.from?.[f])] || '—'} → ${STATE_TEXT[String(d.to?.[f])] || '—'}`;
    if (f === 'description' || Array.isArray(d.from?.[f]) || Array.isArray(d.to?.[f])) {
      return `${label} ${digestText(f, d.from)} → ${digestText(f, d.to)}`;
    }
    return `${label} ${digestText(f, d.from)} → ${digestText(f, d.to)}`;
  }).join('；');
}

// ---------------- 卖点（≤8 条，行序即官网展示序） ----------------
function addHighlight() {
  if (form.value.highlights.length >= HIGHLIGHT_MAX) {
    ElMessage.warning(`卖点最多 ${HIGHLIGHT_MAX} 条`);
    return;
  }
  form.value.highlights.push('');
}
function removeHighlight(i: number) {
  form.value.highlights.splice(i, 1);
}

const picker = ref(false);
function onPicked(url: string) {
  form.value.coverImage = url;
  picker.value = false;
}

function goBack() {
  // 编辑页在标签栏里是独立一页：只 push 会把它留在栏上，下次点回来还是这条产品
  tagsView.delTagsView(route);
  router.push('/admin/content');
}
function fmt(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '—';
}
async function copyUrl(path: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    ElMessage.success('地址已复制');
  } catch {
    ElMessage.warning('浏览器未授权剪贴板，请手动复制');
  }
}
</script>

<template>
  <div v-loading="loading" class="pe">
    <el-card shadow="never" class="pe-bar">
      <div class="pe-bar-in">
        <div class="pe-head">
          <span class="pe-title">{{ isOnline ? '查看已上架产品' : (canWrite ? (draftId != null ? '编辑产品' : '新增产品') : '查看产品') }}</span>
          <el-tag v-if="doc" size="small" :type="isOnline ? 'success' : (doc.state === 'offline' ? 'warning' : 'info')">{{ doc.state_text }}</el-tag>
          <el-tag v-if="!canWrite" size="small" type="warning" effect="plain">只读·无 content:write 权限</el-tag>
          <el-tag v-else-if="dirty" size="small" type="info" effect="plain">有未保存的编辑</el-tag>
          <span v-if="doc" class="pe-last">
            最后由 {{ doc.updated_by_name || '（无记录）' }} 于 {{ fmt(doc.updated_at) }} 修改
          </span>
        </div>
        <div class="pe-ops">
          <el-button @click="goBack">返回列表</el-button>
          <el-button v-if="doc" @click="openHistory">修改记录</el-button>
          <el-button v-if="!readOnly" :loading="saving" @click="saveDraft">保存</el-button>
          <el-button v-if="!readOnly" type="primary" :loading="publishing" @click="saveAndPublish">保存并发布</el-button>
          <el-button v-if="isOnline && canWrite" type="warning" @click="unpublishNow">去下架</el-button>
        </div>
      </div>
    </el-card>

    <el-alert
      v-if="isOnline && !noticeDismissed"
      class="pe-alert"
      type="info"
      show-icon
      :closable="false"
      title="已上架产品只读"
      :description="doc?.readonly_hint || '正在官网上的产品不能直接修改：改动会立即影响访客。要修改请先下架，内容随即进入未上架区，改完再发布。'"
    >
      <div class="pe-alert-ops">
        <el-button v-if="canWrite" type="warning" size="small" @click="unpublishNow">去下架</el-button>
        <el-button size="small" @click="noticeDismissed = true">知道了</el-button>
      </div>
    </el-alert>

    <el-card shadow="never" class="pe-urls">
      <div class="pe-url">
        <span class="pe-url-k">{{ isOnline ? '官网地址' : '上架后可访问' }}</span>
        <template v-if="hasSlug">
          <a v-if="isOnline" class="pe-url-v" :href="liveUrl" target="_blank" rel="noopener">{{ liveUrl }}</a>
          <span v-else class="pe-url-v">{{ liveUrl }}</span>
          <el-button link type="primary" size="small" @click="copyUrl(liveUrl)">复制</el-button>
          <el-tag v-if="!isOnline" size="small" type="info" effect="plain">上架后生效</el-tag>
        </template>
        <span v-else class="pe-url-none">填写标识后生成</span>
      </div>
    </el-card>

    <el-card shadow="never" @mousedown="markTouched" @keydown="markTouched">
      <el-form label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="产品名称" required>
              <el-input v-model="form.name" :disabled="readOnly" placeholder="如：Centremix 移动固态硬盘" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品标识" required>
              <div class="field-with-hint">
                <el-input v-model="form.slug" :disabled="readOnly" placeholder="URL 片段，如：portable-ssd" @input="slugError = ''" />
                <!-- 不挂 el-form-item 的 message：该版本只把它写给校验器，服务端 409 文案会渲染成空。就地提示自己画 -->
                <p v-if="slugHint" class="field-hint" :class="{ 'field-hint--error': !!slugError }">{{ slugHint }}</p>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="所属分类">
              <el-select v-model="form.categoryId" :disabled="readOnly" clearable placeholder="选择产品分类" style="width: 100%">
                <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="系列">
              <el-input v-model="form.series" :disabled="readOnly" placeholder="如：LaCie Mobile" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="上架时间">
              <span class="pe-meta">{{ fmt(doc?.published_at) }}</span>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="价格文案">
              <el-input v-model="form.priceText" :disabled="readOnly" placeholder="如：¥ 起 / 面议" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="购买链接">
              <el-input v-model="form.buyLink" :disabled="readOnly" placeholder="外链或内部路径" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort" :disabled="readOnly" :min="0" :max="999999" />
              <span class="pe-inline-tip">数值越小越靠前</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="一句话简介">
          <el-input v-model="form.summary" :disabled="readOnly" type="textarea" :rows="2" maxlength="400" show-word-limit />
        </el-form-item>

        <el-form-item label="封面图">
          <div class="pe-cover">
            <el-input v-model="form.coverImage" :disabled="readOnly" placeholder="封面 URL，或从媒体库选择" />
            <el-button v-if="!readOnly" @click="picker = true">媒体库</el-button>
          </div>
          <img v-if="form.coverImage" :src="form.coverImage" class="pe-thumb" />
        </el-form-item>

        <el-form-item label="图集">
          <GalleryEditor v-model="form.gallery" :editable="!readOnly" />
        </el-form-item>

        <el-form-item label="卖点">
          <div class="pe-list">
            <div v-for="(h, i) in form.highlights" :key="i" class="pe-row">
              <el-input
                :model-value="h" :disabled="readOnly" size="small" style="flex: 1"
                placeholder="一条卖点描述"
                @update:model-value="(v: string) => { form.highlights[Number(i)] = v; }"
              />
              <el-button v-if="!readOnly" size="small" type="danger" link @click="removeHighlight(Number(i))">删除</el-button>
            </div>
            <el-button v-if="!readOnly" plain type="primary" size="small" @click="addHighlight">
              <el-icon><Plus /></el-icon>添加卖点
            </el-button>
            <span class="pe-count">{{ form.highlights.length }} / {{ HIGHLIGHT_MAX }} 条</span>
          </div>
        </el-form-item>

        <el-form-item label="规格参数">
          <SpecsEditor v-model="form.specs" :editable="!readOnly" />
        </el-form-item>

        <el-form-item label="详细描述">
          <DescriptionEditor
            :model-value="form.description"
            :editable="!readOnly"
            placeholder="支持小标题、段落、列表与站内配图（站外图片会被移除）"
            @update:model-value="onDescription"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <el-dialog v-model="historyVisible" title="修改记录" width="640px">
      <div v-loading="historyLoading" class="pe-hd-wrap">
        <el-alert
          class="pe-hd-note"
          type="info"
          :closable="false"
          show-icon
          title="修改记录自本次修订起"
          description="按内容身份标识（uid）串联：下架再上架仍是同一条产品，历史不断线；本次修订之前的改动没有留痕。"
        />
        <el-timeline v-if="history.length">
          <el-timeline-item
            v-for="h in history"
            :key="h.id"
            :timestamp="fmt(h.created_at)"
            placement="top"
            :type="h.action === 'delete' ? 'danger' : (h.action === 'publish' ? 'success' : 'primary')"
          >
            <div class="pe-hd-line">
              <strong>{{ h.username || '（账号已删除）' }}</strong>
              <span class="pe-hd-act">{{ ACTION_TEXT[h.action] || h.action }}</span>
            </div>
            <div class="pe-hd-fields">{{ changeText(h) }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else-if="!historyLoading" description="这条产品还没有修改记录" />
      </div>
    </el-dialog>

    <MediaPicker v-model:visible="picker" @select="onPicked" />
  </div>
</template>

<style scoped>
.pe-bar {
  margin-bottom: 14px;
}
.pe-bar-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pe-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pe-title {
  font-weight: 600;
  font-size: 15px;
}
.pe-last {
  font-size: 12px;
  color: #909399;
}
.pe-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pe-alert {
  margin-bottom: 14px;
}
.pe-alert-ops {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.pe-urls {
  margin-bottom: 14px;
}
.pe-url {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pe-url-k {
  width: 100px;
  flex: none;
  color: #909399;
  font-size: 13px;
}
.pe-url-v {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
}
.pe-url-none {
  font-size: 13px;
  color: #c0c4cc;
}
.pe-meta {
  font-size: 13px;
  color: #606266;
}
.pe-inline-tip {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
/* 就地校验提示：el-form-item 的 message 在本项目里渲染成空节点，提示由表单自身画 */
.field-with-hint {
  width: 100%;
}
.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #909399;
}
.field-hint--error {
  color: var(--el-color-danger);
}
.pe-cover {
  display: flex;
  gap: 8px;
  width: 100%;
}
.pe-thumb {
  margin-top: 8px;
  width: 160px;
  height: 100px;
  object-fit: cover;
  border-radius: 6px;
  background: #f5f7fa;
}
.pe-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pe-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pe-count {
  font-size: 12px;
  color: #909399;
}
.pe-hd-wrap {
  max-height: 420px;
  overflow: auto;
  padding-top: 4px;
}
.pe-hd-note {
  margin-bottom: 12px;
}
.pe-hd-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.pe-hd-act {
  color: #606266;
}
.pe-hd-fields {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
