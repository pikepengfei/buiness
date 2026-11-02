<script setup lang="ts">
/**
 * 产品图集编辑器（只服务产品表单，产品目录外的界面不引用）
 *
 * 规则与后端 productDraftCreateSchema 对齐（design D8）：
 *  - 上限 8 张，超出不给添加；
 *  - 行序即官网展示序，可上移 / 下移；
 *  - 「添加图片」先落一个空格，选完图才填上——空格由表单提交时滤掉，MUST NOT 落成空串。
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '../../../website/components/MediaPicker.vue';

const props = defineProps<{ modelValue?: string[]; editable?: boolean; max?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const cap = computed(() => props.max ?? 8);
const canEdit = computed(() => props.editable !== false);
// 存量形态不符时按空列表处理：界面不在第二处兜形，提交后由服务端收口
const list = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
const filled = computed(() => list.value.filter((u) => String(u || '').trim()).length);

function write(next: string[]) {
  emit('update:modelValue', next);
}
function add() {
  if (list.value.length >= cap.value) {
    ElMessage.warning(`图集最多 ${cap.value} 张，请先删除多余图片`);
    return;
  }
  write([...list.value, '']);
}
function remove(i: number) {
  const next = [...list.value];
  next.splice(i, 1);
  write(next);
}
function move(i: number, dir: -1 | 1) {
  const t = i + dir;
  if (t < 0 || t >= list.value.length) return;
  const next = [...list.value];
  [next[i], next[t]] = [next[t], next[i]];
  write(next);
}

// 一次只开一个选择器：先记下是哪一格，选完写回那一格
const picker = ref(false);
const slot = ref<number | null>(null);
function openPicker(i: number) {
  slot.value = i;
  picker.value = true;
}
function onPicked(url: string) {
  picker.value = false;
  if (slot.value == null) return;
  const next = [...list.value];
  next[slot.value] = url;
  write(next);
  slot.value = null;
}
</script>

<template>
  <div class="ge">
    <div class="ge-hd">
      <span class="ge-count">已选 {{ filled }} / {{ cap }} 张（顺序即官网展示顺序）</span>
      <el-button v-if="canEdit" size="small" plain type="primary" :disabled="list.length >= cap" @click="add">
        <el-icon><Plus /></el-icon>添加图片
      </el-button>
    </div>
    <div v-for="(g, i) in list" :key="i" class="ge-row">
      <img v-if="g" :src="g" class="ge-thumb" loading="lazy" />
      <span v-else class="ge-thumb ge-empty">未选</span>
      <el-input :model-value="g" :disabled="!canEdit" size="small" placeholder="图片地址，建议从媒体库选择" @update:model-value="(v: string) => { const next = [...list]; next[Number(i)] = v; write(next); }" />
      <el-button v-if="canEdit" size="small" @click="openPicker(Number(i))">
        <el-icon><Picture /></el-icon>选图
      </el-button>
      <el-button v-if="canEdit" size="small" :disabled="Number(i) === 0" @click="move(Number(i), -1)">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <el-button v-if="canEdit" size="small" :disabled="Number(i) === list.length - 1" @click="move(Number(i), 1)">
        <el-icon><ArrowDown /></el-icon>
      </el-button>
      <el-button v-if="canEdit" size="small" type="danger" link @click="remove(Number(i))">删除</el-button>
    </div>
    <div v-if="!list.length" class="ge-none">还没有图集图片，官网详情页只显示封面</div>
    <MediaPicker v-model:visible="picker" @select="onPicked" />
  </div>
</template>

<style scoped>
.ge {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ge-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ge-count {
  font-size: 12px;
  color: #909399;
}
.ge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ge-thumb {
  width: 64px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  background: #f5f7fa;
  flex: none;
}
.ge-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #c0c4cc;
  border: 1px dashed #dcdfe6;
}
.ge-none {
  font-size: 12px;
  color: #909399;
}
</style>
