<script setup lang="ts">
/**
 * 文字基础元素：段落 / 行内两种形态
 *
 * · text 走插值（永远转义），html 走 v-html（标签清洗由后端 deepSanitize 负责，组件本身不放宽可信边界）
 * · tone / size 为选填口径：不填时不输出任何视觉声明，交由所在模块的既有样式决定，
 *   这样模块内替换成基础元素不会改变原呈现（组件库直接插入时才需要自带口径）
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    text?: string;
    html?: string;
    tone?: 'body' | 'muted' | 'invert';
    size?: 'sm' | 'md' | 'lg';
    inline?: boolean;
  }>(),
  { text: '', html: '', tone: undefined, size: undefined, inline: false }
);

const hasContent = computed(() => Boolean(props.html?.trim() || props.text?.trim()));
const classes = computed(() => [
  'ui-text',
  props.tone ? `ui-text--${props.tone}` : '',
  props.size ? `ui-text--${props.size}` : ''
]);
</script>

<template>
  <component :is="inline ? 'span' : 'p'" v-if="hasContent" :class="classes">
    <span v-if="html" v-html="html" />
    <template v-else>{{ text }}</template>
  </component>
</template>

<style scoped>
/* 以下声明只在显式指定 tone / size 时生效 */
.ui-text--body {
  color: var(--ink-900);
}
.ui-text--muted {
  color: var(--ink-500);
}
.ui-text--invert {
  color: #fff;
}

.ui-text--sm {
  font-size: 13.5px;
}
.ui-text--md {
  font-size: 15.5px;
}
.ui-text--lg {
  font-size: 18px;
}
</style>
