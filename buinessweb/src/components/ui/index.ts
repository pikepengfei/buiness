/**
 * 公共基础元素出口：文字 / 标题 / 图片 / 按钮
 *
 * 这些组件既被官网各模块内部直接调用，也在区块注册表里登记为可插入的子内容节点，
 * 两种用法共用同一份实现（避免出现「模块内自写一份 + 注册表另一份」的样式漂移）。
 */
export { default as UiText } from './UiText.vue';
export { default as UiHeading } from './UiHeading.vue';
export { default as UiImage } from './UiImage.vue';
export { default as UiButton } from './UiButton.vue';
export { resolveHref, HREF_RULE_TIP, type HrefMode, type ResolvedHref } from './href';
