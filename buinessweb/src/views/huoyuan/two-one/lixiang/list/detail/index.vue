<script setup lang="ts">
/**
 * 四级菜单1-详情页（隐藏动态路由页，验证四级菜单层级）
 */
import { useRoute } from 'vue-router';

defineOptions({
  name: 'huoyuan-two-one-lixiang-list-detail'
});

const route = useRoute();
</script>

<template>
  <div>四级菜单1 - 详情页，当前路由参数 id：{{ route.params.id }}</div>
</template>
