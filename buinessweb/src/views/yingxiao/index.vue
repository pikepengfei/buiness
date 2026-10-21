<script lang="ts" setup>
import { onMounted, onActivated, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useKeepAliveStore } from '@/stores/keepAlive';

const keepStroe = useKeepAliveStore();

// 缓存页面要用到name
defineOptions({
  name: 'yingxiao'
});

const input = ref('');

onMounted(() => {
  console.log('onMounted...yingxiao...');
});

onActivated(() => {
  console.log('onActivated...yingxiao...');
});

// 在导航离开渲染该组件的对应路由时调用
onBeforeRouteLeave((to, from) => {
  // 如果导航到不是详情页就不缓存
  if (to.name !== 'feiyong-two-one-organization-detail') {
    keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, from.name as string);
  }
  return true;
});
</script>

<template>
  <div class="box">
    <empty class="wu-icon" />
  </div>
  <div>
    {{ $route.params.id }}
  </div>
  <el-input v-model="input" style="width: 240px" placeholder="Please input" />
</template>

<style scoped>
.box {
  display: flex;
  justify-content: center;
  min-height: inherit;
  align-items: center;
}
</style>
