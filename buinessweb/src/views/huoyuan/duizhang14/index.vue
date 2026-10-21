<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();

watch(route, () => {
  // 在这里执行当路由变化时的操作
  console.log('tongji14 路由变化了');
});

console.log('wo shi tongji14 created');
onMounted(() => {
  console.log('wo shi tongji14');
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
