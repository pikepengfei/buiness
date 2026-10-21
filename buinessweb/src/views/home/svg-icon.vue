<script lang="ts" setup>
defineProps({
  size: {
    type: Number,
    default: 24
  }
});
</script>
<template>
  <div class="icon-wrap">
    <slot />
  </div>
</template>
<style scoped>
.icon-wrap {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background-color: var(--el-color-primary);
  display: inline-block;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
