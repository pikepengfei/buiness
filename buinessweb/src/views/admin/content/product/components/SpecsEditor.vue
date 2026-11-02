<script lang="ts">
// <script setup> 不允许出现模块导出，类型放普通 script 块供编辑页 import
// script setup 里不写 export：类型按结构匹配，编辑页各自声明一份同名形状即可
type ProductSpec = { label: string; value: string };
</script>

<script setup lang="ts">
/**
 * 规格参数编辑器（只服务产品表单，产品目录外的界面不引用）
 *
 * 提交形态与后端 specItemSchema 逐字对齐：`[{ label, value }]`，label 必填、value 可为空文案。
 * 行序即官网参数表的展示序，可上移 / 下移；上限 20 行（超出服务端 400，这里先挡住）。
 */
import { computed } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps<{ modelValue?: ProductSpec[]; editable?: boolean; max?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: ProductSpec[]): void }>();

const cap = computed(() => props.max ?? 20);
const canEdit = computed(() => props.editable !== false);
const rows = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

function write(next: ProductSpec[]) {
  emit('update:modelValue', next);
}
function patch(i: number, key: keyof ProductSpec, val: string) {
  const next = rows.value.map((r, idx) => (idx === i ? { ...r, [key]: val } : r));
  write(next);
}
function add() {
  if (rows.value.length >= cap.value) {
    ElMessage.warning(`规格参数最多 ${cap.value} 行，请先删除多余行`);
    return;
  }
  write([...rows.value, { label: '', value: '' }]);
}
function remove(i: number) {
  const next = [...rows.value];
  next.splice(i, 1);
  write(next);
}
function move(i: number, dir: -1 | 1) {
  const t = i + dir;
  if (t < 0 || t >= rows.value.length) return;
  const next = [...rows.value];
  [next[i], next[t]] = [next[t], next[i]];
  write(next);
}
/** 参数名为空的行：提交前由表单拦下并就地标红，不静默丢掉运营已填的值 */
function invalid(i: number) {
  return !String(rows.value[i]?.label ?? '').trim();
}
</script>

<template>
  <div class="se">
    <div class="se-hd">
      <span class="se-count">共 {{ rows.length }} / {{ cap }} 行（顺序即官网参数表顺序）</span>
      <el-button v-if="canEdit" size="small" plain type="primary" :disabled="rows.length >= cap" @click="add">
        <el-icon><Plus /></el-icon>添加规格
      </el-button>
    </div>
    <div v-for="(s, i) in rows" :key="i" class="se-row">
      <el-input
        :model-value="s.label"
        :disabled="!canEdit"
        :class="{ 'se-bad': invalid(Number(i)) }"
        size="small"
        style="width: 200px"
        placeholder="参数名，如：容量"
        @update:model-value="(v: string) => patch(Number(i), 'label', v)"
      />
      <el-input
        :model-value="s.value"
        :disabled="!canEdit"
        size="small"
        style="flex: 1"
        placeholder="参数值，如：20 TB"
        @update:model-value="(v: string) => patch(Number(i), 'value', v)"
      />
      <el-button v-if="canEdit" size="small" :disabled="Number(i) === 0" @click="move(Number(i), -1)">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <el-button v-if="canEdit" size="small" :disabled="Number(i) === rows.length - 1" @click="move(Number(i), 1)">
        <el-icon><ArrowDown /></el-icon>
      </el-button>
      <el-button v-if="canEdit" size="small" type="danger" link @click="remove(Number(i))">删除</el-button>
    </div>
    <div v-if="!rows.length" class="se-none">还没有规格参数，官网详情页不渲染参数表</div>
  </div>
</template>

<style scoped>
.se {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.se-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.se-count {
  font-size: 12px;
  color: #909399;
}
.se-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.se-none {
  font-size: 12px;
  color: #909399;
}
.se-bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
