<script setup lang="ts">
/**
 * 区块渲染器：按 blocks 顺序渲染区块树（结构版本 2 起支持模块装载子内容）
 * - 官网前台：getPage(slug).blocks 直接渲染
 * - 管理端编辑器：传入草稿 blocks + preview=true（表单类区块禁用真实提交）
 * - 模块层走注册表组件，子内容经默认插槽落进模块自身版式内（只有预留子内容位的模块会声明 accepts）
 * - 基础元素层把 props 中注册表声明过的字段直接 v-bind 给 components/ui 的同一份实现；preview 只透传给声明了该 prop 的元素
 * - 逐层过滤 visible=false、未注册 type（前向兼容静默跳过）与「文案和子内容都为空」的模块
 * - demo（组件库预览）只向数据驱动模块透传，令其用内置样例渲染而不发内容请求
 */
import { computed } from 'vue';
import { hasOwnContent, type Block } from './blocks';
import { DATA_DRIVEN_TYPES, SECTION_REGISTRY, atomBindProps, blockLayer } from './sectionRegistry';

const props = defineProps<{ blocks: Block[]; preview?: boolean; demo?: boolean }>();

/** 节点是否会渲染出可见内容：类型已注册、未被隐藏，模块自身有文案或至少有一个可渲染子内容 */
function isRenderable(blk: Block): boolean {
  if (blk.visible === false || !SECTION_REGISTRY[blk.type]) return false;
  if (blockLayer(blk.type) === 'atom') return true;
  return hasOwnContent(blk) || (blk.children || []).some(isRenderable);
}

const renderable = computed(() => (props.blocks || []).filter(isRenderable));

/** 组件库预览：只给数据驱动模块透传 demo，避免其它模块根元素多出无意义 DOM 属性 */
function demoBind(type: string): Record<string, boolean> {
  return props.demo && DATA_DRIVEN_TYPES.includes(type) ? { demo: true } : {};
}
</script>

<template>
  <div class="section-renderer">
    <template v-for="blk in renderable" :key="blk.id">
      <component
        v-if="blockLayer(blk.type) === 'atom'"
        :is="SECTION_REGISTRY[blk.type].component"
        v-bind="atomBindProps(blk.type, blk.props, preview)"
      />
      <component
        v-else
        :is="SECTION_REGISTRY[blk.type].component"
        :p="blk.props"
        :preview="preview"
        v-bind="demoBind(blk.type)"
      >
        <SectionRenderer v-if="blk.children?.length" :blocks="blk.children" :preview="preview" :demo="demo" />
      </component>
    </template>
  </div>
</template>

<style scoped>
.section-renderer { display: block; }
</style>
