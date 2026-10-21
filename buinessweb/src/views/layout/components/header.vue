<script lang="ts" setup>
/**
 * 顶部导航栏组件
 *
 * 核心职责：
 *   1. 展示系统 Logo 和名称
 *   2. 渲染一级菜单（支持外链新窗口打开）
 *   3. 菜单过多时自动折叠到"更多"下拉菜单
 *   4. 响应窗口大小变化动态调整显示菜单数量
 *
 * 特殊说明：
 *   - 外链菜单（http/https 开头）点击时新窗口打开
 *   - 通过 getMenuNumber 动态计算可显示的菜单数量
 */
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import HeaderRight from './header-right.vue';
import { useRouter } from 'vue-router';
import type { MenuItem } from '@/types/global';

const props = defineProps<{
  menuList: MenuItem[];
  route: { matched?: Array<{ path: string }> };
}>();

const { currentRoute } = useRouter();

const emit = defineEmits(['handle-show']);

/**
 * 菜单选中事件处理
 * 外链菜单不触发路由跳转
 *
 * @param key - 菜单路径
 */
const handleSelect = (key: string): boolean | void => {
  if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('//')) {
    return false;
  }
  emit('handle-show', key);
};

/**
 * 当前选中的一级菜单路径
 * 按路径前缀匹配顶层菜单（/admin 子路由归属 '/admin' 顶层项），
 * 原模板直接取 matched[1].path，在 /admin 层级下与菜单 url 对不上
 */
const findTopMenuPath = (): string => {
  const p = currentRoute.value.path;
  const found = props.menuList.find(
    (m) => m.url !== '/' && (p === m.url || p.startsWith(m.url + '/'))
  );
  return found ? found.url : (props.route.matched?.[1]?.path ?? '');
};
const currentPath = ref<string>(findTopMenuPath());

/** 可显示的菜单数量（不含"更多"） */
const menuNumber = ref(4);

/** 前部分菜单（直接显示） */
const menuListFront = computed(() => {
  return props.menuList.slice(0, menuNumber.value);
});

/** 后部分菜单（折叠到"更多"） */
const menuListAfter = computed(() => {
  return props.menuList.slice(menuNumber.value);
});

/**
 * 计算可显示的菜单数量
 * 根据容器宽度和菜单项宽度动态计算
 */
const getMenuNumber = function (): void {
  const clientWidth = document.querySelector('.el-menu')?.clientWidth as unknown as number;
  menuNumber.value = Number.parseInt(String((clientWidth - 104 - 76) / 126)) - 1;
  if (menuNumber.value <= 0) {
    menuNumber.value = 0;
  }
};

/**
 * 菜单点击事件处理
 * 外链菜单新窗口打开
 *
 * @param url - 菜单路径
 */
const handleClick = function (url: string): void {
  currentPath.value = url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    window.open(url);
  }
};

/**
 * 获取菜单的路由配置
 * 外链菜单返回空对象（不触发路由跳转）
 *
 * @param url - 菜单路径
 * @returns 路由配置对象
 */
const getRoute = function (url: string): { path?: string } {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    return {};
  }
  return { path: url };
};

watch(currentRoute, async () => {
  currentPath.value = findTopMenuPath();
});

onMounted(() => {
  getMenuNumber();
  window.addEventListener('resize', getMenuNumber);
});

onUnmounted(() => {
  window.removeEventListener('resize', getMenuNumber);
});
</script>
<template>
  <div class="logo">
    <img class="brand-img" src="/website/img/logo-orange.png" alt="Centremix 芯联创" />
    <span class="brand-tag">管理后台</span>
  </div>
  <el-menu
    :default-active="currentPath"
    router
    class="el-menu"
    :ellipsis="false"
    mode="horizontal"
    @select="handleSelect"
  >
    <!-- 管理菜单在前 -->
    <template v-for="menuItem in menuListFront" :key="menuItem.id">
      <el-menu-item
        :index="menuItem.url"
        class="li-menu-item"
        :route="getRoute(menuItem.url)"
        @click="handleClick(menuItem.url)"
      >
        <div class="menu-item">
          <span class="menu-item-span">{{ menuItem.name }}</span>
        </div>
      </el-menu-item>
    </template>
    <!-- 查看官网在后 -->
    <el-menu-item index="/" class="li-menu-item" :route="getRoute('/')" @click="handleClick('/')">
      <div class="menu-item">
        <span class="menu-item-span">查看官网</span>
      </div>
    </el-menu-item>
    <template v-if="menuListAfter.length > 0">
      <el-sub-menu :index="menuListAfter[0]?.url" :teleported="false">
        <template #title>
          <div class="menu-item">
            <span class="menu-item-span">...更多</span>
          </div>
        </template>
        <template v-for="menuItem in menuListAfter" :key="menuItem.id">
          <el-menu-item
            :index="menuItem.url"
            class="li-menu-item li-vertical-menu-item"
            :route="getRoute(menuItem.url)"
            @click="handleClick(menuItem.url)"
          >
            <div class="menu-item">
              <span class="menu-item-span">{{ menuItem.name }}</span>
            </div>
          </el-menu-item>
        </template>
        <!-- </template> -->
      </el-sub-menu>
    </template>
  </el-menu>
  <!-- 右侧展示登录人 和退出登录 -->
  <HeaderRight />
</template>

<style scoped>
::v-deep(.el-sub-menu__icon-arrow) {
  color: #222222 !important;
}

.logo {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-img {
  height: 34px;
  width: auto;
  display: block;
}

.brand-tag {
  color: #98a4b2;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  padding-left: 10px;
  border-left: 1px solid #dcdfe6;
}

.el-menu {
  margin-left: 28px;
  margin-right: 18px;
  height: 36px;
  background: none;
  border-bottom: none;
  /* 自适应剩余宽度，不再用 100vw 固定宽（100vw 含滚动条会导致横向溢出、页面变形） */
  flex: 1;
  min-width: 0;
  width: auto;
  overflow: hidden;
}
.el-menu--horizontal > .el-menu-item.is-active {
  border-bottom: none;
  background: none;
  &::after {
    content: '';
    width: 24px;
    height: 4px;
    background: #0083ff;
    border-radius: 2px;
    position: absolute;
    bottom: -6px;
  }
}
.el-menu--horizontal > .el-menu-item.is-active .menu-item-span {
  border-bottom: none;
  color: #0083ff !important;
  --zm-nav-opacity: 1;
}
.el-menu--horizontal .el-menu-item:not(.is-disabled):hover {
  --zm-nav-opacity: 1;
}

.el-menu--horizontal .el-menu-item:not(.is-disabled):focus {
  color: #0083ff;
}

.li-menu-item {
  padding: 0;
  border-radius: 8px;
  margin-right: 10px;
}
.menu-item {
  border-radius: 8px;
  padding: 0 15px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.menu-item-span {
  margin-left: 10px;
  font-size: 16px;
  line-height: 16px;
  letter-spacing: 1px;
}
.el-sub-menu {
  height: 36px;
}
.el-menu--horizontal > .el-menu-item {
  border-bottom: none;
}
::v-deep(.el-sub-menu__title) {
  border-bottom: none !important;
  padding-left: 0;
  padding-right: 20px;
  border-radius: 8px;
}

.el-menu--horizontal .el-menu-item:not(.is-disabled):hover {
  background-color: transparent;
  border-radius: 0;
}

.el-menu--horizontal .li-vertical-menu-item:not(.is-disabled):hover {
  background-color: #f5f7fa;
}

.el-menu--horizontal > .el-sub-menu .el-sub-menu__title:hover {
  --zm-nav-opacity: 1;
}
.el-menu--horizontal ::v-deep(.el-menu--popup) {
  .li-vertical-menu-item {
    padding: 0;
  }
}
::v-deep(.el-menu--popup) {
  padding: 10px 0 10px 0;
  min-width: 128px;
}
::v-deep(.el-sub-menu__icon-arrow) {
  color: #fff;
}
.li-vertical-menu-item {
  padding: 0;
  margin: 0;
  margin-top: 10px;
}
.li-vertical-menu-item:nth-of-type(1) {
  margin-top: 0;
}
::v-deep(.el-popper) {
  border: none;
}
.li-vertical-menu-item:hover {
  --zm-nav-opacity: 1;
}

.li-vertical-menu-item.is-active {
  color: #0083ff;
  --zm-nav-opacity: 1;
}

.icon-nav {
  font-size: 16px;
  color: #fff;
  opacity: var(--zm-nav-opacity);
}
</style>
