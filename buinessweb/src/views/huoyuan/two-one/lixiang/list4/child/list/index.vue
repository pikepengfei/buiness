<script setup lang="ts">
/**
 * 五级菜单加长加长1-列表页
 * 用于验证五六级菜单层级是否能正确渲染（/huoyuan/list4 → child → list）
 */
import { useRouter } from 'vue-router';

defineOptions({
  name: 'huoyuan-two-one-lixiang-list4-child-list'
});

const router = useRouter();

// 跳转新增页（name 跳转）
function handleAdd() {
  router.push({ name: 'huoyuan-two-one-lixiang-list4-child-add' });
}

// 跳转详情页（name + params 跳转）
function handleDetail() {
  router.push({
    name: 'huoyuan-two-one-lixiang-list4-child-detail',
    params: { id: '1001' }
  });
}
</script>

<template>
  <div class="verify-page">
    <p>五级菜单加长加长1 - 列表页（六级路由：/huoyuan/list4 → child → list）</p>
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
