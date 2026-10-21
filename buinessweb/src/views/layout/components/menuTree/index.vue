<script lang="ts" setup>
/**
 * 侧边栏菜单树组件
 *
 * 核心职责：
 *   1. 根据菜单数据渲染多级侧边栏菜单（支持一级、二级、三级、四级）
 *   2. 通过 el-menu 的 default-active 实现菜单高亮
 *   3. 支持 el-popover 悬浮菜单（二级菜单有子菜单时使用）
 *   4. 支持菜单收藏功能（isFavorite）
 *   5. 处理外链菜单（新窗口打开）和内部路由菜单（router 导航）
 *
 * 菜单高亮匹配机制：
 *   - el-menu 的 default-active 绑定 activeMenu ref
 *   - activeMenu = route.meta.activeMenu || route.name
 *   - 悬浮菜单高亮使用 activePopoverMenu = route.meta.activePopoverMenu || route.name
 *   - 每个菜单项的 :index 与 asyncRoutes.ts 生成的路由 name 保持一致
 *   - 当 default-active 值 === 某个菜单项 index → 该菜单项高亮
 *
 * 菜单 index 与路由 name 的对应关系：
 *   - 路由 name 由 url 片段用 "-" 拼接生成（如 /feiyong/two-one/organization → feiyong-two-one-organization）
 *   - 菜单 index 使用相同的规则生成，确保两者匹配
 *
 * 特殊功能说明：
 *   - 四层菜单支持：通过 fourChildRoute 和 fourChildReturnIndex 实现
 *   - 悬浮菜单：使用 el-popover + trigger="hover" 实现
 *   - 收藏功能：通过 isFavorite 属性和 clickStarCollectStatus 实现
 *   - activePopoverMenu：用于悬浮菜单的高亮
 */

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { MenuItem } from '@/types/global';

const router = useRouter();

interface Props {
  menuList: MenuItem[];
  firstRouteUrl: string;
  isCollapse: boolean;
  collapseUrl: string;
}

interface RouteConfig {
  path?: string;
}

const popoverMenuRef = ref<{ hide: () => void }[]>([]);
const props = withDefaults(defineProps<Props>(), {
  firstRouteUrl: '',
  isCollapse: false,
  collapseUrl: ''
});
const emit = defineEmits<{
  (e: 'handle-collapse', collapsed: boolean): void;
}>();

/**
 * 判断 url 是否为外链
 * 外链菜单不生成路由，点击时新窗口打开
 */
const isExternalUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
};

/**
 * 获取可见的（非 hidden）菜单项
 * 过滤掉 hidden=true 的路由（如编辑页、详情页），使其不在侧边栏显示
 */
const getVisibleItems = (list?: MenuItem[]): MenuItem[] => {
  if (!list?.length) return [];
  return list.filter((item) => !item.hidden);
};

/**
 * 获取可见的非外链菜单项
 * 外链子级不参与"唯一可见子级提级"计算
 */
const getVisibleNonExternalItems = (list?: MenuItem[]): MenuItem[] => {
  return getVisibleItems(list).filter((item) => !isExternalUrl(item.url));
};

/**
 * 判断菜单是否需要渲染为子级菜单（el-sub-menu/el-popover 可展开）
 *
 * 提级规则：可见的非外链子级只有 1 个、且该子级自身无需展开时，
 * 不渲染子级菜单，父级直接作为可点击菜单项（提级），
 * index 由 resolveMenuIndex 递归指向该子级路由，保证高亮一致。
 */
const hasChildren = (item: MenuItem): boolean => {
  const visibleChildren = getVisibleItems(item.children);
  if (visibleChildren.length === 0) return false;

  const nonExternalVisible = getVisibleNonExternalItems(item.children);
  if (nonExternalVisible.length > 1) return true;

  const hasExternal = visibleChildren.some((child) => isExternalUrl(child.url));
  if (hasExternal && visibleChildren.length > 1) return true;

  for (const child of visibleChildren) {
    if (child.children && child.children.length > 0 && hasChildren(child)) {
      return true;
    }
  }

  return false;
};

/**
 * 生成菜单项的 index 值
 * 规则：url 片段用 "-" 拼接，与 asyncRoutes.ts 中的路由 name 保持一致
 *
 * @example
 *   getMenuIndex('feiyong', 'two-one', 'organization') → 'feiyong-two-one-organization'
 */
const getMenuIndex = (...segments: string[]): string => {
  return segments.map((s) => s.replace(/^\//, '')).join('-');
};

/**
 * 递归解析菜单项 index
 * 当菜单只有一个可见的非外链子级时，向下提级拼接子级片段，
 * 保证 index 与提级后实际落地路由的 name 一致（侧边栏高亮匹配）
 *
 * 注意：此处不处理 activeMenu，由各层级调用方按原优先级自行判断
 */
const resolveMenuIndex = (item: MenuItem, ...parentSegments: string[]): string => {
  if (isExternalUrl(item.url)) {
    return item.url;
  }
  const segment = item.url.replace(/^\//, '');
  const allSegments = [...parentSegments, segment];

  const nonExternalVisible = getVisibleNonExternalItems(item.children);
  if (nonExternalVisible.length === 1 && nonExternalVisible[0]) {
    return resolveMenuIndex(nonExternalVisible[0], ...allSegments);
  }

  return getMenuIndex(...allSegments);
};

/**
 * 一级菜单的路由跳转对象
 * 外链返回空对象（由 handleClick 处理新窗口打开），内部路由返回 { path: menuUrl }
 *
 * 路径计算规则：
 *   - 第一个一级菜单（menuIndex === 0）→ path = firstRouteUrl
 *   - 其他一级菜单 → path = firstRouteUrl + menuUrl
 */
const firstRoute = computed(() => {
  return function (menuUrl: string, menuIndex: number): RouteConfig {
    if (isExternalUrl(menuUrl)) {
      return {};
    }
    let path: string = '';
    if (menuIndex === 0) {
      path = props.firstRouteUrl;
    } else {
      path = props.firstRouteUrl + menuUrl;
    }
    return { path };
  };
});

/**
 * 一级菜单的 index
 * 用于没有子菜单的一级菜单项
 *
 * 优先级：
 *   1. 外链菜单 → 直接返回 url
 *   2. 配置了 activeMenu → 返回 activeMenu
 *   3. 默认 → 用 url 片段拼接生成
 */
const firstRouteIndex = computed(() => {
  return function (menu: MenuItem): string {
    // 除外链返回url,其余返回name拼接，防止权限调证顺序，菜单高亮有问题
    if (menu?.activeMenu) {
      return menu?.activeMenu;
    }
    return resolveMenuIndex(menu, props.firstRouteUrl);
  };
});

/**
 * 二级菜单的路由跳转对象
 *
 * 路径计算规则（与 asyncRoutes.ts 中 buildRoute 的 path 规则一致）：
 *   - 一级菜单是第一个（menuIndex === 0）：
 *     - 二级菜单是第一个（childItemIndex === 0）→ path = firstRouteUrl
 *     - 二级菜单非第一个 → path = firstRouteUrl + childItemUrl
 *   - 一级菜单非第一个：
 *     - 二级菜单是第一个 → path = firstRouteUrl + menuUrl
 *     - 二级菜单非第一个 → path = firstRouteUrl + menuUrl + childItemUrl
 */
const childItemRoute = computed(() => {
  return function (
    menuUrl: string,
    menuIndex: number,
    childItemUrl: string,
    childItemIndex: number
  ): RouteConfig {
    if (isExternalUrl(childItemUrl)) {
      return {};
    }
    let path: string = '';
    if (menuIndex === 0) {
      if (childItemIndex === 0) {
        path = props.firstRouteUrl;
      } else {
        path = props.firstRouteUrl + childItemUrl;
      }
    } else {
      if (childItemIndex === 0) {
        path = props.firstRouteUrl + menuUrl;
      } else {
        path = props.firstRouteUrl + menuUrl + childItemUrl;
      }
    }
    return { path };
  };
});

/**
 * 二级菜单的 index
 * 拼接规则：一级url片段 + 二级url片段
 *
 * 优先级：
 *   1. 外链菜单 → 直接返回 url
 *   2. 配置了 activeMenu → 返回 activeMenu
 *   3. 默认 → 用 url 片段拼接生成
 */
const childItemReturnIndex = computed(() => {
  return function (menuUrl: string, childItem: MenuItem): string {
    if (isExternalUrl(childItem?.url)) {
      return childItem.url;
    }

    if (childItem?.activeMenu) {
      return childItem?.activeMenu;
    }
    return resolveMenuIndex(childItem, props.firstRouteUrl, menuUrl);
  };
});

/**
 * 三级菜单的路由跳转（直接调用 router.push）
 * 因为三级菜单在 el-popover 中，不使用 el-menu-item 的 :route 属性
 *
 * 路径计算规则：
 *   需要同时考虑一级、二级、三级菜单是否为"第一个"，
 *   因为每一级的第一个非外链子路由 path 都为空。
 *
 *   组合情况：
 *   - 一级是第一个 && 二级是第一个 && 三级是第一个 → path = firstRouteUrl
 *   - 一级是第一个 && 二级是第一个 && 三级非第一个 → path = firstRouteUrl + threeChildUrl
 *   - 一级是第一个 && 二级非第一个 && 三级是第一个 → path = firstRouteUrl + childItemUrl
 *   - 一级是第一个 && 二级非第一个 && 三级非第一个 → path = firstRouteUrl + childItemUrl + threeChildUrl
 *   - 一级非第一个 && 二级是第一个 && 三级是第一个 → path = firstRouteUrl + menuUrl
 *   - 一级非第一个 && 二级是第一个 && 三级非第一个 → path = firstRouteUrl + menuUrl + threeChildUrl
 *   - 一级非第一个 && 二级非第一个 && 三级是第一个 → path = firstRouteUrl + menuUrl + childItemUrl
 *   - 一级非第一个 && 二级非第一个 && 三级非第一个 → path = firstRouteUrl + menuUrl + childItemUrl + threeChildUrl
 *
 * 额外处理：
 *   - 点击后关闭所有悬浮菜单（popoverMenuRef.value.forEach((it) => it.hide())）
 */
const threeChildRoute = (
  menuUrl: string,
  menuIndex: number,
  childItemUrl: string,
  childItemIndex: number,
  threeChildUrl: string,
  threeChildIndex: number
) => {
  if (isExternalUrl(threeChildUrl)) {
    return;
  }

  let path: string = '';
  if (menuIndex === 0) {
    if (childItemIndex === 0) {
      path = threeChildIndex === 0 ? props.firstRouteUrl : props.firstRouteUrl + threeChildUrl;
    } else {
      path =
        threeChildIndex === 0
          ? props.firstRouteUrl + childItemUrl
          : props.firstRouteUrl + childItemUrl + threeChildUrl;
    }
  } else {
    if (childItemIndex === 0) {
      path =
        threeChildIndex === 0
          ? props.firstRouteUrl + menuUrl
          : props.firstRouteUrl + menuUrl + threeChildUrl;
    } else {
      path =
        threeChildIndex === 0
          ? props.firstRouteUrl + menuUrl + childItemUrl
          : props.firstRouteUrl + menuUrl + childItemUrl + threeChildUrl;
    }
  }
  popoverMenuRef.value.forEach((it) => it.hide());
  router.push(path);
};

/**
 * 三级菜单的 index
 * 拼接规则：一级url片段 + 二级url片段 + 三级url片段
 *
 * 优先级：
 *   1. 外链菜单 → 直接返回 url
 *   2. 默认 → 用 url 片段拼接生成
 */
const threeChildReturnIndex = computed(() => {
  return function (menuUrl: string, childItemUrl: string, threeChild: MenuItem): string {
    return resolveMenuIndex(threeChild, props.firstRouteUrl, menuUrl, childItemUrl);
  };
});

/**
 * 四级菜单的路由跳转（直接调用 router.push）
 *
 * 路径计算规则：
 *   需要同时考虑一级、二级、三级、四级菜单是否为"第一个"
 *
 * 额外处理：
 *   - 点击后关闭所有悬浮菜单
 */
const fourChildRoute = (
  menuUrl: string,
  menuIndex: number,
  childItemUrl: string,
  childItemIndex: number,
  threeChildUrl: string,
  threeChildIndex: number,
  fourChildUrl: string,
  fourChildIndex: number
) => {
  let path: string = '';

  if (menuIndex === 0) {
    if (childItemIndex === 0) {
      if (threeChildIndex === 0) {
        path = fourChildIndex === 0 ? props.firstRouteUrl : props.firstRouteUrl + fourChildUrl;
      } else {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + threeChildUrl
            : props.firstRouteUrl + threeChildUrl + fourChildUrl;
      }
    } else {
      if (threeChildIndex === 0) {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + childItemUrl
            : props.firstRouteUrl + childItemUrl + fourChildUrl;
      } else {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + childItemUrl + threeChildUrl
            : props.firstRouteUrl + childItemUrl + threeChildUrl + fourChildUrl;
      }
    }
  } else {
    if (childItemIndex === 0) {
      if (threeChildIndex === 0) {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + menuUrl
            : props.firstRouteUrl + menuUrl + fourChildUrl;
      } else {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + menuUrl + threeChildUrl
            : props.firstRouteUrl + menuUrl + threeChildUrl + fourChildUrl;
      }
    } else {
      if (threeChildIndex === 0) {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + menuUrl + childItemUrl
            : props.firstRouteUrl + menuUrl + childItemUrl + fourChildUrl;
      } else {
        path =
          fourChildIndex === 0
            ? props.firstRouteUrl + menuUrl + childItemUrl + threeChildUrl
            : props.firstRouteUrl + menuUrl + childItemUrl + threeChildUrl + fourChildUrl;
      }
    }
  }

  popoverMenuRef.value.forEach((it) => it.hide());
  router.push(path);
};

/**
 * 四级菜单的 index
 * 拼接规则：一级url片段 + 二级url片段 + 三级url片段 + 四级url片段
 *
 * 优先级：
 *   1. 外链菜单 → 直接返回 url
 *   2. 默认 → 用 url 片段拼接生成
 */
const fourChildReturnIndex = computed(() => {
  return function (
    menuUrl: string,
    childItemUrl: string,
    threeChild: MenuItem,
    fourChild: MenuItem
  ): string {
    return resolveMenuIndex(fourChild, props.firstRouteUrl, menuUrl, childItemUrl, threeChild?.url);
  };
});

// 菜单点击收起展开收起
const handleCollpase = function () {
  emit('handle-collapse', !props.isCollapse);
};

/**
 * 菜单高亮状态管理
 *
 * activeMenu 的值来源（优先级从高到低）：
 *   1. route.meta.activeMenu — 用于隐藏页面（如添加页、详情页）高亮其所属的可见父级菜单
 *   2. route.name — 默认使用路由 name，与菜单项 index 匹配实现高亮
 *
 * activePopoverMenu 的值来源（优先级从高到低）：
 *   1. route.meta.activePopoverMenu — 用于悬浮菜单的高亮
 *   2. route.name — 默认使用路由 name
 *
 * 当路由变化时，watch 会自动更新 activeMenu 和 activePopoverMenu
 */
const { currentRoute } = useRouter();
const active = (
  currentRoute.value.meta?.activeMenu
    ? currentRoute.value.meta?.activeMenu
    : currentRoute.value.name
) as string;
const popoverActive = (
  currentRoute.value.meta?.activePopoverMenu
    ? currentRoute.value.meta?.activePopoverMenu
    : currentRoute.value.name
) as string;

const activeMenu = ref<string>(active);
const activePopoverMenu = ref<string>(popoverActive);

watch(currentRoute, async (newVal) => {
  activeMenu.value = (newVal.meta?.activeMenu ? newVal.meta?.activeMenu : newVal.name) as string;
  activePopoverMenu.value = (
    newVal.meta?.activePopoverMenu ? newVal.meta?.activePopoverMenu : newVal.name
  ) as string;
});

/**
 * 菜单项点击处理
 * - 外链菜单：新窗口打开，并设置 activeMenu 为 url（外链没有路由 name）
 */
const handleClick = function (url: string) {
  if (isExternalUrl(url)) {
    activeMenu.value = url;
    window.open(url);
  }
};

/**
 * 判断路由是否激活（用于悬浮菜单项的高亮）
 * 通过比较路由 name 或 activePopoverMenu 来判断
 */
const activeRouter = computed(() => {
  return function (name: string): boolean {
    return router.currentRoute.value.name === name || name === activePopoverMenu.value;
  };
});

// 收藏相关
const clickStarCollectStatus = (menuItem: MenuItem, status: boolean) => {
  console.log('点击是否收藏', menuItem, status);
  setCollectionConfirmListData(menuItem, status);
};

const setCollectionConfirmListData = async (menuItem: MenuItem, status: boolean) => {
  console.log(menuItem, status);
  // 判断是否为收藏列表后设置menuId
  // const menuId = status ? menuItem.menuId : menuItem.id;
  // try {
  //   // 调用API确认收藏
  //   const res: ApiResponse = await setCollectionConfirmList(menuId)
  //   if (res.code !== '0') {
  //     console.error('收藏接口请求错误:', res.msg)
  //     return
  //   }
  //   // 根据状态显示不同的成功消息
  //   const message = status || menuItem.isFavorite ? '取消成功' : '收藏成功'
  //   ElMessage.success(message)
  //   // 为了少请求一次，本地设置菜单的收藏状态
  //   setFavoriteByMenuList(props.menuList, menuId)
  //   // store.setUserInfo()
  //   // 成功确认收藏后，刷新收藏列表数据
  //   await getCollectionListData()
  // } catch (error) {
  //   // 捕获并记录确认收藏时的错误
  //   console.error('收藏操作失败:', error)
  // }
};
</script>

<template>
  <div class="aside-left-box">
    <el-scrollbar class="aside-box">
      <el-menu
        router
        :unique-opened="true"
        :default-active="activeMenu"
        active-text-color="#0083FF"
        class="app-menu"
        :collapse="isCollapse"
      >
        <template v-for="(menu, menuIndex) in props.menuList">
          <!-- 第一级菜单 有children-->
          <el-sub-menu
            v-if="hasChildren(menu)"
            :index="menu.url.replace('/', '')"
            :key="menu.id"
            class="menu-sub"
          >
            <template v-slot:title>
              <el-icon>
                <svg class="icon icon-aside" aria-hidden="true">
                  <use :xlink:href="'#' + menu.icon"></use>
                </svg>
              </el-icon>
              <span>{{ menu.name }}</span>
            </template>
            <!-- 第二级菜单循环 -->
            <template
              v-for="(childItem, childItemIndex) in getVisibleItems(menu.children)"
              :key="childItem.url"
            >
              <!-- 第二级菜单 有children（使用 el-popover 悬浮菜单）-->
              <el-popover
                v-if="hasChildren(childItem)"
                placement="right-start"
                trigger="hover"
                popper-class="menu-popover"
                :show-arrow="false"
                :offset="20"
                ref="popoverMenuRef"
                :tabindex="-1"
              >
                <template #reference>
                  <!-- menu 选中的匹配-->
                  <el-menu-item
                    :route="childItemRoute(menu.url, menuIndex, childItem.url, childItemIndex)"
                    :index="childItemReturnIndex(menu.url, childItem)"
                    :key="childItem.id"
                  >
                    <template #title>
                      <span>{{ childItem.name }}</span>
                    </template>
                  </el-menu-item>
                </template>
                <div class="menu-container">
                  <template
                    v-for="(threeChild, threeChildIndex) in getVisibleItems(childItem.children)"
                    :key="threeChild.url"
                  >
                    <div class="third-menu-info" v-if="hasChildren(threeChild)">
                      <div class="mg20 third-menu-info-title">
                        <span class="third-title-text">{{ threeChild.name }}</span>
                        <el-icon size="15">
                          <svg
                            class="icon star"
                            :class="[threeChild.isFavorite ? 'icon-star-hover' : 'icon-star']"
                            aria-hidden="true"
                          >
                            <use xlink:href="#icon-xingxing"></use>
                          </svg>
                        </el-icon>
                      </div>
                      <!--循环五级菜单 -->
                      <el-row :gutter="20">
                        <el-col
                          :span="8"
                          v-for="(fourChild, fourChildIndex) in getVisibleItems(
                            threeChild.children
                          )"
                          :key="fourChild.name"
                        >
                          <div
                            class="menu-four-title-box"
                            @click="
                              fourChildRoute(
                                menu.url,
                                menuIndex,
                                childItem.url,
                                childItemIndex,
                                threeChild.url,
                                threeChildIndex,
                                fourChild.url,
                                fourChildIndex
                              )
                            "
                            :class="{
                              'is-active-router': activeRouter(
                                fourChildReturnIndex(menu.url, childItem.url, threeChild, fourChild)
                              )
                            }"
                          >
                            <span class="four-child-text">{{ fourChild.name }}</span>

                            <el-icon
                              size="15"
                              @click.stop="clickStarCollectStatus(threeChild, true)"
                            >
                              <svg
                                class="icon star"
                                :class="[threeChild.isFavorite ? 'icon-star-hover' : 'icon-star']"
                                aria-hidden="true"
                              >
                                <use xlink:href="#icon-xingxing"></use>
                              </svg>
                            </el-icon>
                          </div>
                        </el-col>
                      </el-row>
                    </div>
                    <!-- 只有四级菜单的显示 -->
                    <div v-else class="third-menu-info">
                      <div
                        class="mg20 third-menu-info-title"
                        @click="
                          threeChildRoute(
                            menu.url,
                            menuIndex,
                            childItem.url,
                            childItemIndex,
                            threeChild.url,
                            threeChildIndex
                          )
                        "
                        :class="{
                          'is-active-router': activeRouter(
                            threeChildReturnIndex(menu.url, childItem.url, threeChild)
                          )
                        }"
                      >
                        <!-- 可以跳转的三级菜单 不存在 children 的 三级菜单-->

                        <span class="third-title-text">{{ threeChild.name }}</span>
                        <el-icon size="15" @click.stop="clickStarCollectStatus(threeChild, true)">
                          <svg
                            class="icon star"
                            :class="[threeChild.isFavorite ? 'icon-star-hover' : 'icon-star']"
                            aria-hidden="true"
                          >
                            <use xlink:href="#icon-xingxing"></use>
                          </svg>
                        </el-icon>
                      </div>
                    </div>
                  </template>
                </div>
              </el-popover>

              <!-- 第二级菜单 没有children-->
              <el-menu-item
                v-else
                :index="childItemReturnIndex(menu.url, childItem)"
                :key="`${childItem.id || childItem.url}-${childItemIndex}`"
                :route="childItemRoute(menu.url, menuIndex, childItem.url, childItemIndex)"
                class="menu-item"
                @click="handleClick(childItem.url)"
              >
                <span>{{ childItem.name }}</span>
              </el-menu-item>
            </template>
          </el-sub-menu>
          <!-- 第一级菜单 没有children-->
          <el-menu-item
            v-else
            :index="firstRouteIndex(menu)"
            :key="`${menu.id || menu.url}-${menuIndex}`"
            :route="firstRoute(menu.url, menuIndex)"
            class="menu-item"
            @click="handleClick(menu.url)"
          >
            <el-icon>
              <svg class="icon icon-aside" aria-hidden="true">
                <use :xlink:href="'#' + menu.icon"></use>
              </svg>
            </el-icon>
            <span>{{ menu.name }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-scrollbar>
    <div class="collapse-box">
      <div @click="handleCollpase" class="expend-box">
        <svg class="icon icon-collapse-box" aria-hidden="true">
          <use :xlink:href="'#icon-' + collapseUrl"></use>
        </svg>
      </div>
    </div>
  </div>
</template>
<style>
/* 弹窗样式 */
.el-popover.menu-popover {
  padding: 10px 15px 0 15px;
  max-height: calc(100vh - var(--zm-header-height));
  overflow: auto;
  border-radius: 0;
  width: auto !important;
}

.el-popover.menu-popover::-webkit-scrollbar {
  width: 8px;
}

.el-popover.menu-popover::-webkit-scrollbar-thumb {
  background: #a09f9f;
  border-radius: 8px;
}

.el-popover.menu-popover::-webkit-scrollbar-track {
  width: 8px;
  background: #e6e6e6;
}
</style>
<style scoped>
.aside-box {
  position: relative;
  flex-shrink: 0;
  height: calc(100vh - var(--zm-header-height) - 40px);
  width: var(--zm-el-aside-width);
  transition: width 0.5s;
  background: transparent;
  padding: 0 20px;
}

.app-menu {
  background: none;
  border-right: none;
  height: 100%;
}

.menu-item {
  color: var(--el-menu-text-color);
}

.menu-item:hover {
  background: #fff;
  color: var(--el-color-primary);
  border-radius: 8px;
  .childItem-span {
    background: var(--el-color-primary);
  }
}
.menu-item.is-active {
  background-color: var(--el-color-primary);
  color: #fff;
  border-radius: 8px;
  .childItem-span {
    background: var(--el-color-primary);
  }
}

.menu-sub :deep(.el-sub-menu__title) {
  color: var(--el-menu-text-color);
}

.menu-sub :deep(.el-sub-menu__title):hover {
  background-color: #fff;
  color: var(--el-color-primary);
}

.menu-sub.is-active :deep(.el-sub-menu__title) {
  color: var(--el-color-primary);
}

.menu-sub :deep(.el-menu) {
  background: none;
}

.childItem-span {
  display: flex;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 15px;
  background: var(--el-menu-text-color);
}

/* 收起展开 */
.collapse-box {
  position: relative;
  height: 40px;
  display: flex;
  align-items: center;
  /* width: var(--zm-el-aside-width); */
  box-sizing: border-box;
  transition: width 0.5s;
}

.expend-box {
  cursor: pointer;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  right: 30px;
  position: absolute;
  width: 24px;
  height: 24px;
}

.icon-collapse-box {
  font-size: 18px;
  color: var(--el-menu-text-color);
}

.menu-container {
  font-size: var(--el-font-size-base);
  font-weight: normal;
  line-height: 20px;
  letter-spacing: 0px;
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
  .mg20 {
    margin-bottom: 10px;
    margin-top: 10px;
  }

  .third-menu-info {
    font-weight: bold;
    font-size: var(--el-font-size-medium);
    /* 主色/主色 */
    color: var(--el-menu-text-color);
    display: flex;
    flex-direction: column;
  }

  .third-menu-info-title {
    font-weight: bold;
    font-size: var(--el-font-size-medium);
    display: flex;
    cursor: pointer;
  }

  .third-menu-info-title:hover {
    color: var(--el-color-primary);
  }

  .is-active-router {
    color: var(--el-color-primary) !important;
  }

  .menu-three-title {
    margin-right: 20px;
  }

  .menu-four-title-box {
    cursor: pointer;
    display: flex;
    margin-bottom: 24px;
    color: #4e5969;
  }

  .four-child-text {
    font-weight: 400;
    flex: 1;
    margin-right: 20px;
  }

  .four-child-text:hover {
    color: var(--el-color-primary) !important;
  }

  .star {
    width: 15px;
    height: 14px;
  }

  .icon-star {
    color: #d9d9d9;
  }

  .icon-star:hover {
    color: #ffa22b;
  }

  .icon-star-hover {
    color: #ffa22b;
  }

  .third-title-text {
    margin-right: 20px;
    flex: 1;
  }
}
</style>
