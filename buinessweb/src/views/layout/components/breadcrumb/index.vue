<template>
  <div class="breadcrumb-box">
    <el-breadcrumb separator="/" class="ame-breadcrumb">
      <TransitionGroup appear enter-active-class="animate__animated animate__fadeInRight">
        <el-breadcrumb-item
          v-for="item in breadcrumbList"
          :key="item.name"
          :to="{ name: findFirstRoute(item).name }"
        >
          {{ item.meta.title }}
        </el-breadcrumb-item>
      </TransitionGroup>
    </el-breadcrumb>
  </div>
</template>

<script setup lang="ts">
/**
 * 面包屑导航组件
 *
 * 核心职责：
 *   1. 展示当前页面的路由层级
 *   2. 支持点击面包屑项跳转
 *
 * 特殊说明：
 *   - 自动过滤掉首页（不需要在面包屑中显示）
 */
import { computed } from 'vue';
import { useRoute, type RouteRecordRaw } from 'vue-router';

const route = useRoute();

/** 面包屑列表（过滤掉首页一级路由） */
const breadcrumbList = computed(() => {
  // 注意：必须用 slice(1) 返回新数组。
  // 禁止对 route.matched 使用 shift/splice 等原地修改操作——
  // route.matched 是 router 当前路由的内部记录数组，原地修改会破坏路由匹配状态，
  // 导致 /redirect 刷新页等二级 router-view 无法渲染组件（页面卡死在 redirect 中间页）
  return (route.matched ?? []).slice(1);
});

/**
 * 递归查找路由的第一个子路由
 * 用于面包屑点击时跳转到正确的页面
 *
 * @param routeItem - 路由配置项
 * @returns 第一个可跳转的子路由
 */
const findFirstRoute = (routeItem: RouteRecordRaw): RouteRecordRaw => {
  if (!routeItem.children || routeItem.children.length === 0) {
    return routeItem;
  }
  return findFirstRoute(routeItem.children[0]);
};
</script>

<style scoped>
.breadcrumb-box {
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 14px 20px;
  background: #eff6ff;
}

.ame-breadcrumb {
  .el-breadcrumb__inner a:hover,
  .el-breadcrumb__inner.is-link:hover {
    color: var(--el-color-primary);
  }
}
</style>
