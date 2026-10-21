<script lang="ts" setup>
import { onMounted, onActivated } from 'vue';
// 缓存页面要用到name
defineOptions({
  name: 'huoyuan-duizhang12'
});

onMounted(() => {
  console.log('onMounted...huoyuan-duizhang12...');
});

onActivated(() => {
  console.log('onActivated...huoyuan-duizhang12...');
});
</script>

<template>
  <div class="box">
    <empty class="wu-icon" />
  </div>
</template>

<style scoped>
.box {
  display: flex;
  justify-content: center;
  min-height: inherit;
  align-items: center;
}
</style>
