<script setup lang="ts">
/**
 * 资讯编辑页（新增 / 编辑未发布内容 / 查看已上线内容）
 *
 * 一条内容同一时刻只存在于一张表，所以本页只有一个 id：
 * path 上的数字是发布表行 id（只读），query.draft 是未发布表行 id（可编辑、可发布、可删除）。
 * 已上线内容不可原地修改：进入后先给出「需先下线才能修改」的提示，出口只有「去下线」与「查看」。
 * 每个写请求都带 uid（跨表稳定的内容身份标识），服务端据此拒绝「数字相同但不是同一条内容」的请求。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useAuthStore } from '@/stores/auth';
import { useTagsViewStore } from '@/stores/tagsView';
import type {
  ArticleCategoryAdminRow, ArticleDraftPayload, ArticleEditable, AuditRow,
} from '@/types/cms';
import MediaPicker from '../../website/components/MediaPicker.vue';
import RichBodyEditor from './components/RichBodyEditor.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const tagsView = useTagsViewStore();
// 服务端每个写端点都挂 content:write，这里只负责把入口收掉：只读账号看得到内容但按不出保存/发布
const canWrite = computed(() => auth.hasPerm('content:write'));

const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const cats = ref<ArticleCategoryAdminRow[]>([]);
const editorRef = ref<InstanceType<typeof RichBodyEditor> | null>(null);

const form = ref<ArticleDraftPayload & { title: string; tags: string[] }>({
  title: '', coverImage: '', summary: '', body: '', categoryId: null, tags: [], author: '',
});
const tagInput = ref('');
// 标识不在表单里：它由服务端在创建时生成，本页只读回显（新建时等创建响应，编辑时等取数行）
const slug = ref('');
// 与最近一次落库的表单快照比对：加载后不该显示「有未保存的编辑」，深监听 form 做不到这一点
const snapshot = ref('');

// 单份语义：doc 就是这一条内容当前所在的那一行，不再有「线上份 / 待发布份」两份同时在场
const doc = ref<ArticleEditable | null>(null);
const uid = ref('');
const draftId = ref<number | null>(null);
const isOnline = computed(() => doc.value?.origin === 'online');
// 只读的两种来源：没有写权限，或这条内容正在官网上（必须先下线才能改）
const readOnly = computed(() => !canWrite.value || isOnline.value);
const noticeDismissed = ref(false);

const liveUrl = computed(() => (isOnline.value && slug.value ? `/article/${slug.value}` : ''));
const pendingUrl = computed(() => (!isOnline.value && slug.value ? `/article/${slug.value}` : ''));
const dirty = computed(() => snapshot.value !== JSON.stringify(form.value));

function routeIds() {
  const p = route.params.id ? Number(route.params.id) : null;
  const d = route.query.draft ? Number(route.query.draft) : null;
  return { p, d };
}

async function load() {
  const { p, d } = routeIds();
  loading.value = true;
  try {
    cats.value = await cmsAdmin.articleCategories.list();
    // 两个端点各读自己那张表的行：path → 发布表，query.draft → 未发布表
    const row = p != null
      ? await cmsAdmin.articles.get(p)
      : (d != null ? await cmsAdmin.articleDrafts.get(d) : null);
    doc.value = row;
    noticeDismissed.value = false;
    if (!row) {
      uid.value = '';
      draftId.value = null;
      slug.value = '';
      form.value = { title: '', coverImage: '', summary: '', body: '', categoryId: null, tags: [], author: '' };
      snapshot.value = JSON.stringify(form.value);
      return;
    }
    uid.value = row.uid;
    draftId.value = row.origin === 'draft' ? row.id : null;
    slug.value = row.slug || '';
    form.value = {
      title: row.title || '',
      coverImage: row.cover_image || '',
      summary: row.summary || '',
      body: row.body || '',
      categoryId: row.category_id ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      author: row.author || '',
    };
    snapshot.value = JSON.stringify(form.value);
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
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
  if (n > 0) ElMessage.warning(`正文中 ${n} 张站外图片已被移除，请从素材库重新插入`);
}
function payload(): ArticleDraftPayload {
  return {
    title: form.value.title.trim(),
    coverImage: form.value.coverImage || null,
    summary: form.value.summary || null,
    body: form.value.body || '',
    categoryId: form.value.categoryId ?? null,
    tags: form.value.tags,
    author: form.value.author || null,
  };
}

/** 落到未发布行：已有行 PATCH（带 uid 校验身份），没有行则新建并把 id 写回地址 */
async function persistDraft(): Promise<number | null> {
  const b = payload();
  if (draftId.value != null) {
    const r = await cmsAdmin.articleDrafts.update(draftId.value, uid.value, b);
    warnStripped(r.stripped_images);
    return draftId.value;
  }
  const c = await cmsAdmin.articleDrafts.create(b);
  uid.value = c.uid;
  draftId.value = c.id;
  // 标识由服务端在这一步生成，响应直接带回来回显，不必等重新取数
  slug.value = c.slug;
  warnStripped(c.stripped_images);
  // 未发布行只能挂在 query 上：不写回地址，刷新就回到空白新增页，再存一次会多出一条草稿
  skipWatch = true;
  await router.replace({ query: { ...route.query, draft: String(c.id) } });
  return c.id;
}

function validate(): boolean {
  if (!form.value.title.trim()) { ElMessage.warning('请填写标题'); return false; }
  return true;
}

async function saveDraft() {
  if (readOnly.value || !validate() || saving.value) return;
  saving.value = true;
  try {
    await persistDraft();
    snapshot.value = JSON.stringify(form.value);
    ElMessage.success('已保存');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 保存并发布 = 两次调用：先写未发布行，再把整行搬进发布表；搬运保留浏览量与首次发布时间 */
async function saveAndPublish() {
  if (readOnly.value || !validate() || publishing.value) return;
  // 空正文的判定与后端 hasVisibleText 同口径，就地拦下而不是等服务端 400
  if (editorRef.value?.isEmpty) {
    ElMessage.warning('正文还没有实际文字，可以保存草稿，但不能发布');
    editorRef.value.focus();
    return;
  }
  publishing.value = true;
  try {
    const id = await persistDraft();
    if (id == null) return;
    const res = await cmsAdmin.articleDrafts.publish(id, uid.value);
    skipWatch = true;
    await router.replace(`/admin/content/articles/edit/${res.id}`);
    ElMessage.success(res.first_published
      ? '已发布到官网'
      : `已发布，浏览量 ${res.view_count} 与首次发布时间一并延续`);
    if (res.stripped_images > 0) ElMessage.warning(`正文中 ${res.stripped_images} 张站外图片已被移除`);
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '发布失败');
  } finally {
    publishing.value = false;
  }
}

/** 去下线：整行搬回未发布侧，搬完直接进同一行 id 的可编辑形态（uid 不变，历史接着同一时间线） */
async function unpublishNow() {
  if (!doc.value || !canWrite.value) return;
  try {
    await ElMessageBox.confirm(
      `下线后官网立即不可访问，内容会保留在未发布区，需重新发布才恢复。确认下线「${doc.value.title}」？`,
      '下线确认', { type: 'warning' });
    const res = await cmsAdmin.articles.unpublish(doc.value.id);
    ElMessage.success('已下线，现在可以修改了');
    skipWatch = true;
    await router.replace({ path: '/admin/content/articles/edit', query: { draft: String(res.draft_id) } });
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
  create: '新建', update: '保存', publish: '发布', unpublish: '下线', delete: '删除',
};
const FIELD_TEXT: Record<string, string> = {
  slug: '标识', title: '标题', cover_image: '封面', summary: '摘要', body: '正文',
  category_id: '分类', tags: '标签', author: '作者', state: '状态',
};
const STATE_TEXT: Record<string, string> = { draft: '草稿', published: '已上线', offline: '已下线' };

async function openHistory() {
  if (!uid.value) { ElMessage.info('内容保存后才有修改记录'); return; }
  historyVisible.value = true;
  historyLoading.value = true;
  try {
    const res = await cmsAdmin.audit.byArticleUid(uid.value, { pageSize: 50 });
    history.value = res.list;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '修改记录加载失败');
  } finally {
    historyLoading.value = false;
  }
}

/** 一次改动的人类可读描述：正文只带长度与摘要，不把整份正文摊进时间线 */
function bodyLen(side: Record<string, unknown> | undefined, f: string): number {
  return Number((side?.[f] as { length?: number } | undefined)?.length ?? 0);
}
function changeText(r: AuditRow): string {
  const d = r.diff;
  if (!d || !d.fields?.length) return '—';
  const parts = d.fields.map((f) => {
    const label = FIELD_TEXT[f] || f;
    if (f === 'body') return `${label} ${bodyLen(d.from, f)} 字 → ${bodyLen(d.to, f)} 字`;
    if (f === 'state') return `${label} ${STATE_TEXT[String(d.from?.[f])] || '—'} → ${STATE_TEXT[String(d.to?.[f])] || '—'}`;
    return label;
  });
  return parts.join('；');
}

function addTag() {
  const t = tagInput.value.trim();
  if (t && !form.value.tags.includes(t)) form.value.tags.push(t);
  tagInput.value = '';
}
function removeTag(i: number) {
  form.value.tags.splice(i, 1);
}

const picker = ref(false);
function onPicked(url: string) {
  form.value.coverImage = url;
  picker.value = false;
}
function goBack() {
  // 编辑页在标签栏里是独立一页：只 push 会把它留在栏上，下次点回来还是这条内容
  tagsView.delTagsView(route);
  router.push('/admin/content/articles');
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
  <div v-loading="loading" class="ae">
    <el-card shadow="never" class="ae-bar">
      <div class="ae-bar-in">
        <div class="ae-head">
          <span class="ae-title">{{ isOnline ? '查看线上资讯' : (canWrite ? (draftId != null ? '编辑资讯' : '新增资讯') : '查看资讯') }}</span>
          <el-tag v-if="doc" size="small" :type="isOnline ? 'success' : (doc.state === 'offline' ? 'warning' : 'info')">{{ doc.state_text }}</el-tag>
          <el-tag v-if="!canWrite" size="small" type="warning" effect="plain">只读·无 content:write 权限</el-tag>
          <el-tag v-else-if="dirty" size="small" type="info" effect="plain">有未保存的编辑</el-tag>
          <span v-if="doc" class="ae-last">
            最后由 {{ doc.updated_by_name || '（无记录）' }} 于 {{ fmt(doc.updated_at) }} 修改
          </span>
        </div>
        <div class="ae-ops">
          <el-button @click="goBack">返回列表</el-button>
          <el-button v-if="doc" @click="openHistory">修改记录</el-button>
          <el-button v-if="!readOnly" :loading="saving" @click="saveDraft">保存</el-button>
          <el-button v-if="!readOnly" type="primary" :loading="publishing" @click="saveAndPublish">保存并发布</el-button>
        </div>
      </div>
    </el-card>

    <el-alert
      v-if="isOnline && !noticeDismissed"
      class="ae-alert"
      type="info"
      show-icon
      :closable="false"
      title="线上内容只读"
      description="正在官网上的内容不能直接修改：改动会立即影响访客。要修改请先下线，内容随即进入未发布区，改完再发布。"
    >
      <div class="ae-alert-ops">
        <el-button v-if="canWrite" type="warning" size="small" @click="unpublishNow">去下线</el-button>
        <el-button size="small" @click="noticeDismissed = true">查看</el-button>
      </div>
    </el-alert>

    <el-card shadow="never" class="ae-urls">
      <div class="ae-url">
        <span class="ae-url-k">{{ isOnline ? '官网地址' : '发布后可访问' }}</span>
        <template v-if="liveUrl">
          <a class="ae-url-v" :href="liveUrl" target="_blank" rel="noopener">{{ liveUrl }}</a>
          <el-button link type="primary" size="small" @click="copyUrl(liveUrl)">复制</el-button>
        </template>
        <template v-else-if="pendingUrl">
          <span class="ae-url-v">{{ pendingUrl }}</span>
          <el-tag size="small" type="info" effect="plain">发布后生效</el-tag>
        </template>
        <span v-else class="ae-url-none">保存后自动生成</span>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-form label-width="90px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" :disabled="readOnly" placeholder="资讯标题" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="标识">
              <!-- 位置与原来一致，只是从输入框换成只读展示：标识由服务端在保存时生成，此后冻结 -->
              <div class="ae-slug-box">
                <span class="ae-meta">{{ slug || '保存后自动生成' }}</span>
                <span v-if="slug" class="ae-slug-url">/article/{{ slug }}</span>
                <span v-else class="ae-slug-url">标识由系统在保存时生成，改名不影响官网地址</span>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分类">
              <el-select v-model="form.categoryId" :disabled="readOnly" clearable placeholder="选择分类" style="width: 100%">
                <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="作者">
              <el-input v-model="form.author" :disabled="readOnly" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="发布时间">
              <span class="ae-meta">{{ fmt(doc?.published_at) }}</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="摘要">
          <el-input v-model="form.summary" :disabled="readOnly" type="textarea" :rows="2" maxlength="400" show-word-limit />
        </el-form-item>

        <el-form-item label="封面图">
          <div class="ae-cover">
            <el-input v-model="form.coverImage" :disabled="readOnly" placeholder="封面 URL，或从媒体库选择" />
            <el-button v-if="!readOnly" @click="picker = true">媒体库</el-button>
          </div>
          <img v-if="form.coverImage" :src="form.coverImage" class="ae-thumb" />
        </el-form-item>

        <el-form-item label="标签">
          <div class="ae-tags">
            <el-tag v-for="(t, i) in form.tags" :key="i" :closable="!readOnly" class="ae-tag" @close="removeTag(Number(i))">{{ t }}</el-tag>
            <template v-if="!readOnly">
              <el-input v-model="tagInput" size="small" style="width: 160px" placeholder="输入后回车添加" @keyup.enter="addTag" @blur="addTag" />
              <el-button size="small" @click="addTag">添加</el-button>
            </template>
          </div>
        </el-form-item>

        <el-form-item label="正文">
          <RichBodyEditor
            ref="editorRef"
            v-model="form.body"
            :editable="!readOnly"
            placeholder="请输入正文…（站外图片会被移除）"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <el-dialog v-model="historyVisible" title="修改记录" width="640px">
      <div v-loading="historyLoading" class="ae-hd-wrap">
        <el-timeline v-if="history.length">
          <el-timeline-item
            v-for="h in history"
            :key="h.id"
            :timestamp="fmt(h.created_at)"
            placement="top"
            :type="h.action === 'delete' ? 'danger' : (h.action === 'publish' ? 'success' : 'primary')"
          >
            <div class="ae-hd-line">
              <strong>{{ h.username || '（账号已删除）' }}</strong>
              <span class="ae-hd-act">{{ ACTION_TEXT[h.action] || h.action }}</span>
            </div>
            <div class="ae-hd-fields">{{ changeText(h) }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else-if="!historyLoading" description="这条内容还没有修改记录" />
      </div>
    </el-dialog>

    <MediaPicker v-model:visible="picker" @select="onPicked" />
  </div>
</template>

<style scoped>
.ae-bar {
  margin-bottom: 14px;
}
.ae-bar-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ae-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ae-title {
  font-weight: 600;
  font-size: 15px;
}
.ae-last {
  font-size: 12px;
  color: #909399;
}
.ae-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ae-alert {
  margin-bottom: 14px;
}
.ae-alert-ops {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.ae-urls {
  margin-bottom: 14px;
}
.ae-url {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ae-url-k {
  width: 90px;
  flex: none;
  color: #909399;
  font-size: 13px;
}
.ae-url-v {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
}
.ae-url-none {
  font-size: 13px;
  color: #c0c4cc;
}
.ae-meta {
  font-size: 13px;
  color: #606266;
}
/* 标识只读展示位：短码在上，官网地址在下，位置沿用原来那个输入框的格子 */
.ae-slug-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.5;
}
.ae-slug-url {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}
.ae-cover {
  display: flex;
  gap: 8px;
  width: 100%;
}
.ae-thumb {
  margin-top: 8px;
  width: 160px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  background: #f5f7fa;
}
.ae-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ae-hd-wrap {
  max-height: 420px;
  overflow: auto;
  padding-top: 4px;
}
.ae-hd-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ae-hd-act {
  color: #606266;
}
.ae-hd-fields {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
