<script lang="ts" setup>
/**
 * 主布局组件
 *
 * 核心职责：
 *   1. 组织页面整体布局结构（顶部导航 + 左侧菜单 + 主内容区）
 *   2. 管理菜单展开/收起状态
 *   3. 根据路由动态显示/隐藏左侧菜单
 *   4. 初始化页面水印
 *
 * 特殊说明：
 *   - 首页不显示左侧菜单和标签栏
 *   - 使用 keep-alive 缓存二级路由页面
 */
import { computed, onActivated, onMounted, provide, ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useUserInfoStore } from '@/stores/userInfo';
import { useTagsViewStore } from '@/stores/tagsView';
import MenuTree from './components/menuTree/index.vue';
import Header from './components/header.vue';
import { userNameKey } from '@/views/key';
import TagsView from './components/tags-view.vue';
import Breadcrumb from './components/breadcrumb/index.vue';
import { useKeepAliveStore } from '@/stores/keepAlive';
import { useWatermark } from '@/hooks/waterMark';
import type { MenuItem } from '@/types/global';

defineOptions({
  name: 'layout'
});

const route = useRoute();

const store = useUserInfoStore();
const menuList = store.menuTree;

const tagsViewStore = useTagsViewStore();

/** 页签全部关闭后清空页签栏下方的内容 */
const hasTagsView = computed(() => tagsViewStore.visitedViews.length > 0);

/** 页面组件 key：路径 + 刷新计数，页签栏「重新加载」递增计数即可重建当前页面 */
const pageComponentKey = computed(() => `${route.path}#${tagsViewStore.refreshSeed}`);

/** 二级路由缓存列表 */
const keepStore = useKeepAliveStore();
const secondKeepAliveRoute = keepStore.secondKeepAliveRoute;
/** 菜单展开/收起图标 */
const collapseUrl = ref('icon-shouqi');

/** 顶部一级菜单（过滤隐藏路由） */
const menuListFront = computed(() => {
  return menuList.filter((item: MenuItem) => !item.hidden);
});

/**
 * 当前一级菜单：按路径前缀匹配（/admin 及其子路由都归属顶层菜单项）
 * 原模板用 route.matched[1].path 精确匹配，对 /admin 层级子路由不适用
 */
const currentMenu = computed<MenuItem | undefined>(() => {
  return menuList.find(
    (item: MenuItem) => !item.hidden && item.url !== '/' && (route.path === item.url || route.path.startsWith(item.url + '/'))
  );
});

/** 当前一级菜单下的二级菜单列表 */
const menuListReactive = computed(() => {
  const arr = currentMenu.value?.children ?? [];
  return arr.filter((item: MenuItem) => !item.hidden);
});

/** 当前一级菜单路径（menuTree 组件拼接子路由的基准） */
const firstRouteUrl = computed(() => currentMenu.value?.url ?? route.path);

/**
 * 判断是否显示左侧菜单
 * 首页不显示左侧菜单
 *
 * @param url - 当前路由路径
 * @returns 是否显示
 */
const showMenu = (url: string = route.path): boolean => {
  return url !== '/';
};

/** 菜单是否收起 */
const isCollapse = ref(false);

/**
 * 左侧菜单展开/收起事件
 *
 * @param load - 是否收起
 */
const handleCollapse = (load: boolean): void => {
  isCollapse.value = load;
};

/** 向子组件提供用户名称 */
provide(userNameKey, store.userInfo?.['name'] as string);

/** 监听菜单展开/收起，更新侧边栏宽度 */
watch(isCollapse, (newVal) => {
  const commonLayout = document.querySelector('.common-layout') as HTMLElement | null;
  if (!commonLayout) return;
  const asideWidth = newVal ? '64px' : '210px';
  const icon = newVal ? 'icon-zhankai' : 'icon-shouqi';
  commonLayout.style.setProperty('--zm-el-aside-width', asideWidth);
  collapseUrl.value = icon;
});

onMounted(() => {
  useWatermark();
});

onActivated(() => {});
</script>
<template>
  <el-container class="common-layout">
    <el-header class="app-header">
      <Header :menuList="menuListFront" :route="route" />
    </el-header>

    <el-container class="app-container">
      <MenuTree
        :menuList="menuListReactive"
        :firstRouteUrl="firstRouteUrl"
        :isCollapse="isCollapse"
        @handle-collapse="handleCollapse"
        :collapseUrl="collapseUrl"
        v-if="showMenu() && menuListReactive.length > 0"
      />
      <el-container class="app-main">
        <!-- 首页不展示页签 -->
        <tags-view v-if="showMenu()" :currentRoute="route"></tags-view>
        <Breadcrumb v-if="showMenu() && hasTagsView"></Breadcrumb>
        <el-scrollbar v-if="hasTagsView">
          <div class="app-main-content">
            <div class="app-main-content-box">
              <router-view v-slot="{ Component }">
                <keep-alive :include="secondKeepAliveRoute">
                  <component :is="Component" :key="pageComponentKey" />
                </keep-alive>
              </router-view>
            </div>
          </div>
        </el-scrollbar>
      </el-container>
    </el-container>
  </el-container>
</template>

<style scoped>
.common-layout {
  height: 100%;
  --zm-el-aside-width: 210px;
  background: url(@/assets/img/background.png) no-repeat center center;
  background-size: 100% 100%;
  /* 防止子元素横向溢出把页面撑宽/产生横向滚动 */
  overflow: hidden;
  box-sizing: border-box;
}

.app-header {
  height: var(--zm-header-height);
  display: flex;
  align-items: center;
  background-size: 100% 100%;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.app-container {
  height: calc(100vh - var(--zm-header-height));
  position: relative;
}

.app-main {
  padding-top: 2px;
  padding-left: 2px;
  padding-right: 2px;
  background: #ffffff;
  display: flex;
  flex: 1;
  flex-basis: auto;
  box-sizing: border-box;
  flex-direction: column;
  border-radius: 8px;
}

.app-main-content {
  padding-right: 20px;
  padding-left: 20px;
}

.app-main-content-box {
  background: #fff;
  min-height: calc(
    100vh - var(--zm-header-height) - var(--zm-tags-view-height) - 30px - 20px -
      var(--zm-footer-height)
  );
}
</style>
