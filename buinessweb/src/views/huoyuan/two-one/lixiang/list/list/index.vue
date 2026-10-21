<script setup lang="ts">
/**
 * 四级菜单1-列表页
 * 用于验证四级菜单层级是否能正确渲染（/huoyuan → lixiang → list → list）
 */
import { useRouter } from 'vue-router';

defineOptions({
  name: 'huoyuan-two-one-lixiang-list-list'
});

const router = useRouter();

// 跳转新增页（name 跳转）
function handleAdd() {
  router.push({ name: 'huoyuan-two-one-lixiang-list-add' });
}

// 跳转详情页（name + params 跳转）
function handleDetail() {
  router.push({
    name: 'huoyuan-two-one-lixiang-list-detail',
    params: { id: '2001' }
  });
}
</script>

<template>
  <div class="verify-page">
    <p>四级菜单1 - 列表页（四级路由：/huoyuan → lixiang → list → list）</p>
    <el-button type="primary" @click="handleAdd">前往新增</el-button>
    <el-button @click="handleDetail">前往详情</el-button>
  </div>
</template>

<style scoped>
.verify-page {
  padding: 20px;
  font-size: 16px;
}
</style>
