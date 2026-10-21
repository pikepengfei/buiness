<script setup lang="ts">
/**
 * 五级菜单加长加长1-详情页（隐藏动态路由页，验证五六级菜单层级）
 */
import { useRoute } from 'vue-router';

defineOptions({
  name: 'huoyuan-two-one-lixiang-list4-child-detail'
});

const route = useRoute();
</script>

<template>
  <div>五级菜单加长加长1 - 详情页，当前路由参数 id：{{ route.params.id }}</div>
</template>
