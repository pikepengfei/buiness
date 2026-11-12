<script setup lang="ts">
/**
 * 按钮基础元素：官网按钮的唯一实现
 *
 * 版式逐属性对齐 website.css 的 .btn 系列（13px 26px 内边距、999px 圆角、14px/600 字号），
 * 样式留在组件内、只消费既有 CSS 变量，不再向全局样式追加类。
 */
import { computed } from 'vue';
import { HREF_RULE_TIP, resolveHref } from './href';

const props = withDefaults(
  defineProps<{
    text?: string;
    /** 跳转地址：站内路径 / 锚点 / mailto: / tel:；留空则渲染为可点击的 button */
    to?: string;
    variant?: 'solid' | 'ghost' | 'ghost-light';
    disabled?: boolean;
    /** 管理端预览态：非法地址给出可见提示，官网态只保证不产生失效跳转 */
    preview?: boolean;
  }>(),
  { text: '', to: '', variant: 'solid', disabled: false, preview: false }
);

const emit = defineEmits<{ (e: 'click'): void }>();

const resolved = computed(() => resolveHref(props.to));
// 非法地址仍渲染出可辨认外观，但不产生跳转，避免官网出现失效按钮
const invalid = computed(() => resolved.value.mode === 'invalid');

const classes = computed(() => [
  'ui-btn',
  `ui-btn--${props.variant}`,
  { 'is-disabled': props.disabled, 'is-invalid': invalid.value }
]);
</script>

<template>
  <div v-if="preview && invalid" class="ui-btn-warn">{{ HREF_RULE_TIP }}</div>

  <router-link v-else-if="resolved.mode === 'router'" :to="resolved.href" :class="classes">
    <slot>{{ text }}</slot>
  </router-link>

  <a v-else-if="resolved.mode === 'anchor'" :href="resolved.href" :class="classes">
    <slot>{{ text }}</slot>
  </a>

  <a v-else-if="resolved.mode === 'raw'" :href="resolved.href" :class="classes">
    <slot>{{ text }}</slot>
  </a>

  <a v-else-if="invalid" :class="classes" href="#" @click.prevent>
    <slot>{{ text }}</slot>
  </a>

  <button v-else type="button" :class="classes" :disabled="disabled" @click="emit('click')">
    <slot>{{ text }}</slot>
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 26px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  text-decoration: none;
}

.ui-btn--solid {
  background: var(--brand);
  color: #fff;
}
.ui-btn--solid:hover {
  background: var(--brand-dark);
  transform: translateY(-1px);
}

.ui-btn--ghost {
  background: transparent;
  color: var(--ink-900);
  border-color: var(--ink-300);
}
.ui-btn--ghost:hover {
  border-color: var(--ink-900);
  background: var(--ink-50);
}

.ui-btn--ghost-light {
  background: #fff;
  color: var(--brand);
}
.ui-btn--ghost-light:hover {
  background: var(--ink-50);
}

.ui-btn.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.ui-btn-warn {
  padding: 6px 10px;
  border: 1px dashed var(--brand);
  border-radius: var(--r-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 1.5;
}
</style>
