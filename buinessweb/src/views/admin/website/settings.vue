<script setup lang="ts">
/**
 * 站点设置：按 group 分组渲染表单，编辑后一次性提交变更项
 * 数据 GET /settings → group→key→{value,label}；保存 PATCH /settings body=[{key,value}]
 * 例外：logo_url 走「上传即保存」，由 POST /upload/logo 固定命名落盘并写回设置，不参与脏项提交
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
import { useSiteStore, DEFAULT_LOGO_URL } from '@/stores/site';
import type { SettingsGrouped } from '@/types/cms';

const GROUP_TITLES: Record<string, string> = {
  general: '基础信息',
  seo: 'SEO 优化',
  social: '社交媒体',
  contact: '联系方式',
};

const grouped = ref<SettingsGrouped>({});
const values = reactive<Record<string, string>>({}); // key -> 当前编辑值
const initial = reactive<Record<string, string>>({}); // key -> 加载初值
const loading = ref(false);
const saving = ref(false);
const dirtyKeys = ref<Set<string>>(new Set());

// 与 backend/src/routes/upload.ts 的 IMAGE_EXTS / multipart 上限保持一致
const LOGO_KEY = 'logo_url';
const LOGO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];
const LOGO_MAX_BYTES = 20 * 1024 * 1024;

const logoUrl = ref('');
const logoUploading = ref(false);
const logoInput = ref<HTMLInputElement | null>(null);
// 与素材库页同理：label 内放 el-button 会导致点击无法唤起文件选择框，这里直接驱动 input
const pickLogo = () => logoInput.value?.click();
const isDefaultLogo = computed(() => !logoUrl.value || logoUrl.value === DEFAULT_LOGO_URL);
const logoName = computed(() => (logoUrl.value || DEFAULT_LOGO_URL).split('?')[0].split('/').pop() || '');
const logoPreview = computed(() => logoUrl.value || DEFAULT_LOGO_URL);

async function onLogoFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || logoUploading.value) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!LOGO_EXTS.includes(ext)) return ElMessage.error(`不支持 .${ext || '未知'}，仅允许 ${LOGO_EXTS.join('/')}`);
  if (file.size > LOGO_MAX_BYTES) return ElMessage.error(`图片超过 ${LOGO_MAX_BYTES / 1024 / 1024}MB 上限`);

  logoUploading.value = true;
  try {
    const res = await cmsAdmin.settings.uploadLogo(file);
    logoUrl.value = res.url;
    // 官网壳层重新拉站点配置，保证后台切回官网时顶栏已是新图（/public/site 为 no-cache + ETag）
    await useSiteStore().ensureLoaded(true);
    ElMessage.success('Logo 已更新，官网左上角即刻引用新图');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败');
  } finally {
    logoUploading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const data = await cmsAdmin.settings.get();
    grouped.value = data;
    Object.keys(values).forEach((k) => delete values[k]);
    Object.keys(initial).forEach((k) => delete initial[k]);
    Object.values(data).forEach((items) => {
      Object.entries(items).forEach(([key, cfg]) => {
        values[key] = cfg.value ?? '';
        initial[key] = cfg.value ?? '';
      });
    });
    logoUrl.value = data.general?.[LOGO_KEY]?.value ?? '';
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function track(key: string) {
  if (values[key] !== initial[key]) dirtyKeys.value.add(key);
  else dirtyKeys.value.delete(key);
  dirtyKeys.value = new Set(dirtyKeys.value);
}
const changedCount = computed(() => dirtyKeys.value.size);

async function save() {
  const items = [...dirtyKeys.value].map((key) => ({ key, value: values[key] }));
  if (!items.length) {
    ElMessage.info('没有需要保存的修改');
    return;
  }
  saving.value = true;
  try {
    await cmsAdmin.settings.update(items);
    items.forEach((it) => (initial[it.key] = it.value));
    dirtyKeys.value = new Set();
    ElMessage.success(`已保存 ${items.length} 项设置`);
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

// 长文本字段用 textarea 判断
function isLong(v: string) {
  return typeof v === 'string' && v.length > 40;
}
const groupOrder = Object.keys(GROUP_TITLES);
function sortedGroups() {
  const keys = Object.keys(grouped.value);
  return keys.sort((a, b) => {
    const ia = groupOrder.indexOf(a);
    const ib = groupOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}
/** logo_url 用上传控件呈现，从通用文本项里摘出去 */
function fieldsOf(g: string) {
  return Object.entries(grouped.value[g] || {}).filter(([key]) => key !== LOGO_KEY);
}
</script>

<template>
  <div v-loading="loading" class="settings">
    <el-card shadow="never" class="st-bar">
      <div class="st-bar-in">
        <span class="st-title">站点设置</span>
        <span class="st-changed">
          <el-tag v-if="changedCount" type="warning" size="small">{{ changedCount }} 项未保存</el-tag>
          <span v-else class="st-muted">全部已保存</span>
        </span>
        <el-button type="primary" :loading="saving" :disabled="!changedCount" @click="save">保存修改</el-button>
      </div>
    </el-card>

    <el-card v-for="g in sortedGroups()" :key="g" shadow="never" class="st-group">
      <template #header><span class="st-gt">{{ GROUP_TITLES[g] || g }}</span></template>
      <el-form label-width="150px">
        <el-form-item v-if="g === 'general'" label="品牌 Logo">
          <div class="st-logo">
            <div class="st-logo-prev"><img :src="logoPreview" alt="Logo 预览" /></div>
            <div class="st-logo-side">
              <el-button :loading="logoUploading" @click="pickLogo">
                {{ logoUploading ? '上传中…' : isDefaultLogo ? '上传 Logo' : '更换 Logo' }}
              </el-button>
              <input ref="logoInput" type="file" accept="image/*" hidden @change="onLogoFile" />
              <p class="st-logo-tip">
                上传即保存：图片固定命名为 brand/logo.&lt;ext&gt; 并覆盖旧图，官网左上角直接引用这张图。
              </p>
              <p class="st-logo-name">
                当前文件：{{ logoName }}
                <el-tag v-if="isDefaultLogo" type="info" size="small">内置默认</el-tag>
              </p>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-for="[key, cfg] in fieldsOf(g)" :key="key" :label="cfg.label || key">
          <el-input
            v-model="values[String(key)]"
            :type="isLong(values[String(key)]) ? 'textarea' : 'text'"
            :rows="3"
            @input="track(String(key))"
          />
          <div class="st-key">{{ key }}</div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.st-bar {
  margin-bottom: 14px;
}
.st-bar-in {
  display: flex;
  align-items: center;
  gap: 14px;
}
.st-title {
  font-weight: 600;
  font-size: 15px;
}
.st-changed {
  flex: 1;
}
.st-muted {
  color: #909399;
  font-size: 13px;
}
.st-group {
  margin-bottom: 14px;
}
.st-gt {
  font-weight: 600;
}
.st-logo {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.st-logo-prev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 190px;
  height: 72px;
  padding: 8px 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  /* 透明底 Logo 需要棋盘格衬底，否则白字 PNG 在纯白卡片上不可见 */
  background: repeating-conic-gradient(#f5f7fa 0% 25%, #fff 0% 50%) 50% / 16px 16px;
}
.st-logo-prev img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.st-logo-side {
  flex: 1;
}
.st-logo-tip,
.st-logo-name {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
.st-key {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 2px;
}
</style>
