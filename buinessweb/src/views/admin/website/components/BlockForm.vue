<script setup lang="ts">
/**
 * 区块内容通用表单：按 formSchema 渲染编辑控件，直接就地修改 model（草稿 props）
 * 支持 kind：text / textarea / html / number / image / select / lines / link / object / list
 * object / link / list 递归复用本组件（name: BlockForm）
 */
import { ref } from 'vue';
import type { FieldSchema } from '@/website/sectionRegistry';
import MediaPicker from './MediaPicker.vue';

defineOptions({ name: 'BlockForm' });

const props = defineProps<{ schema: FieldSchema[]; model: Record<string, any> }>();

// link kind 的固定子字段（{text, link} 二元组）
function linkFields(): FieldSchema[] {
  return [
    { key: 'text', label: '文字', kind: 'text' },
    { key: 'link', label: '链接', kind: 'text', placeholder: '如：/products' },
  ];
}

// 保证 object/link/list/lines 字段有可编辑的初始值
props.schema.forEach((f) => {
  if (f.kind === 'object' || f.kind === 'link') {
    if (typeof props.model[f.key] !== 'object' || props.model[f.key] === null) props.model[f.key] = {};
    if (f.kind === 'link') {
      props.model[f.key].text ??= '';
      props.model[f.key].link ??= '';
    }
  } else if (f.kind === 'list' || f.kind === 'lines') {
    if (!Array.isArray(props.model[f.key])) props.model[f.key] = [];
  }
});

function itemTitle(f: FieldSchema, item: Record<string, any>, idx: number): string {
  if (!f.itemLabel) return `条目 ${idx + 1}`;
  return f.itemLabel.replace(/\{(\w+)\}/g, (_, k) => String(item?.[k] ?? '') || `条目 ${idx + 1}`);
}

function listAdd(f: FieldSchema) {
  const arr = props.model[f.key] as Record<string, any>[];
  const item: Record<string, any> = {};
  (f.fields || []).forEach((sub) => {
    if (sub.kind === 'object' || sub.kind === 'link') item[sub.key] = {};
    else if (sub.kind === 'list' || sub.kind === 'lines') item[sub.key] = [];
    else if (sub.kind === 'number') item[sub.key] = 0;
    else item[sub.key] = '';
  });
  arr.push(item);
}
function listMove(f: FieldSchema, idx: number, delta: number) {
  const arr = props.model[f.key] as Record<string, any>[];
  const t = idx + delta;
  if (t < 0 || t >= arr.length) return;
  const [it] = arr.splice(idx, 1);
  arr.splice(t, 0, it);
}
function listRemove(f: FieldSchema, idx: number) {
  (props.model[f.key] as Record<string, any>[]).splice(idx, 1);
}

// ---- image 字段：共享一个媒体选择弹窗 ----
const pickerVisible = ref(false);
const pickerKey = ref('');
function openPicker(key: string) {
  pickerKey.value = key;
  pickerVisible.value = true;
}
function onPicked(url: string) {
  props.model[pickerKey.value] = url;
}
</script>

<template>
  <div class="block-form">
    <div v-for="f in schema" :key="f.key" class="bf-field">
      <label class="bf-label">{{ f.label }}</label>

      <!-- 简单文本类 -->
      <el-input
        v-if="f.kind === 'text'"
        v-model="model[f.key]"
        :placeholder="f.placeholder"
        clearable
      />
      <el-input
        v-else-if="f.kind === 'textarea'"
        v-model="model[f.key]"
        type="textarea"
        :rows="4"
        :placeholder="f.placeholder"
      />
      <el-input
        v-else-if="f.kind === 'html'"
        v-model="model[f.key]"
        type="textarea"
        :rows="10"
        placeholder="HTML 源码，保存时后端自动清洗"
      />
      <el-input-number
        v-else-if="f.kind === 'number'"
        v-model="model[f.key]"
        :min="0"
        :max="50"
      />
      <el-select v-else-if="f.kind === 'select'" v-model="model[f.key]" style="width: 100%">
        <el-option v-for="op in f.options || []" :key="op.value" :label="op.label" :value="op.value" />
      </el-select>

      <!-- 图片：URL 输入 + 媒体库选择 -->
      <div v-else-if="f.kind === 'image'" class="bf-image-row">
        <el-input v-model="model[f.key]" placeholder="图片 URL，或从媒体库选择" />
        <el-button @click="openPicker(f.key)">媒体库</el-button>
      </div>

      <!-- 字符串数组 -->
      <div v-else-if="f.kind === 'lines'" class="bf-lines">
        <div v-for="(line, i) in model[f.key]" :key="i" class="bf-line">
          <el-input v-model="model[f.key][i]" :placeholder="f.placeholder || `第 ${Number(i) + 1} 行`" />
          <el-button link type="danger" @click="model[f.key].splice(Number(i), 1)">删除</el-button>
        </div>
        <el-button link type="primary" @click="model[f.key].push('')">+ 添加一行</el-button>
      </div>

      <!-- 单对象子表单（object / link） -->
      <div v-else-if="f.kind === 'object' || f.kind === 'link'" class="bf-group">
        <BlockForm :schema="f.kind === 'link' ? linkFields() : f.fields || []" :model="model[f.key]" />
      </div>

      <!-- 对象 repeater（list） -->
      <div v-else-if="f.kind === 'list'" class="bf-list">
        <div v-for="(item, i) in model[f.key]" :key="i" class="bf-item">
          <div class="bf-item-head">
            <span class="bf-item-title">{{ itemTitle(f, item, Number(i)) }}</span>
            <span class="bf-item-ops">
              <el-button link size="small" :disabled="i === 0" @click="listMove(f, Number(i), -1)">↑</el-button>
              <el-button link size="small" :disabled="i === model[f.key].length - 1" @click="listMove(f, Number(i), 1)">↓</el-button>
              <el-button link size="small" type="danger" @click="listRemove(f, Number(i))">删除</el-button>
            </span>
          </div>
          <BlockForm :schema="f.fields || []" :model="item" />
        </div>
        <el-button plain type="primary" style="width: 100%" @click="listAdd(f)">+ 添加{{ f.label }}</el-button>
      </div>

      <div v-if="f.tip" class="bf-tip">{{ f.tip }}</div>
    </div>

    <MediaPicker v-model:visible="pickerVisible" @select="onPicked" />
  </div>
</template>

<style scoped>
.block-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.bf-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.bf-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.bf-image-row {
  display: flex;
  gap: 8px;
}
.bf-image-row .el-input {
  flex: 1;
}
.bf-lines .bf-line {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.bf-group {
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  padding: 12px;
}
.bf-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bf-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fafbfc;
}
.bf-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.bf-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}
</style>
