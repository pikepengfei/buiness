<script setup lang="ts">
/**
 * 站点设置：按 group 分组渲染表单，编辑后一次性提交变更项
 * 数据 GET /settings → group→key→{value,label}；保存 PATCH /settings body=[{key,value}]
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { cmsAdmin } from '@/api/cms';
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
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const dirtyKeys = ref<Set<string>>(new Set());
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
        <el-form-item v-for="(cfg, key) in grouped[g]" :key="key" :label="cfg.label || key">
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
.st-key {
  font-size: 12px;
  color: #a8abb2;
  margin-top: 2px;
}
</style>
