<script lang="ts" setup>
/**
 * 标签页视图组件
 *
 * 核心职责：
 *   1. 展示已访问页面的标签页列表
 *   2. 支持标签页的关闭、刷新、关闭其他、关闭全部操作
 *   3. 支持标签页栏的左右滚动
 *   4. 自动滚动到当前激活的标签页
 *
 * 特殊说明：
 *   - 关闭标签页时会同步清除对应的 keep-alive 缓存
 *   - 使用 useScrollTo 实现平滑滚动效果
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, unref } from 'vue';
import { useTagsViewStore } from '@/stores/tagsView';
import {
  useRouter,
  NavigationFailureType,
  isNavigationFailure,
  type RouteLocationNormalizedLoaded,
  type RouterLinkProps
} from 'vue-router';
import { ElScrollbar } from 'element-plus';
import { useScrollTo } from './useScrollTo';
import type { TagView } from '@/types/global';

const store = useTagsViewStore();
const router = useRouter();

/** 已访问的标签页列表 */
const visitedViews = computed(() => {
  return store.visitedViews;
});

/** 滚动事件参数接口 */
interface ScrollEvent {
  scrollLeft: number;
}

const props = defineProps<{
  currentRoute: TagView;
}>();

const currentRoute = props.currentRoute;

/**
 * 添加标签页
 * 不展示页签的（noTagsView）和隐藏的（hidden）页面不添加标签
 *
 * @param routeView - 路由信息
 */
const addTags = function (routeView: TagView): void {
  if (!routeView.meta?.['noTagsView']) {
    store.setTagsView(routeView);
  }
};

/**
 * 判断标签页是否为当前激活状态
 *
 * @param routeView - 标签页路由信息
 * @returns 是否激活
 */
const isActive = function (routeView: TagView): boolean {
  return currentRoute.path === routeView.path;
};

/**
 * 关闭选中的标签页
 * 如果关闭的是当前标签页，则跳转到最后一个标签页；
 * 全部关闭后不再跳转，由布局层清空内容区
 *
 * @param tag - 需要关闭的标签页
 */
const closeSelectedTag = function (tag: TagView): void {
  store
    .delTagsView(tag)
    .then((res) => {
      if (isActive(tag)) {
        toLastView(res as TagView[]);
      }
    })
    .catch((err) => {
      console.error(err);
    });
};

/**
 * 跳转到最后一个标签页
 * 已无标签页时保持当前路由，内容区随标签列表清空而隐藏
 *
 * @param visitedViews - 当前的标签页列表
 */
const toLastView = function (visitedViews: TagView[]): void {
  const latestView = visitedViews.slice(-1)[0];
  if (latestView) {
    router.push(latestView.fullPath);
  }
};

/** el-scrollbar 组件实例 */
const scrollbarRef = ref<InstanceType<typeof ElScrollbar>>();

/** 当前滚动位置 */
const scrollLeftNumber = ref(0);

/**
 * 滚动事件处理
 * 记录当前滚动位置
 *
 * @param scrollEvent - 滚动事件对象
 */
const scroll = (scrollEvent: ScrollEvent): void => {
  scrollLeftNumber.value = scrollEvent.scrollLeft;
};

/**
 * 移动标签页栏指定距离
 *
 * @param to - 移动距离（正数向右，负数向左）
 */
const move = (to: number): void => {
  const wrap$ = unref(scrollbarRef)?.wrapRef;
  const { start } = useScrollTo({
    el: wrap$!,
    position: 'scrollLeft',
    to: unref(scrollLeftNumber) + to,
    duration: 500
  });
  start();
};

/**
 * 滚动到当前激活的标签页
 */
const moveToCurrentTag = async (): Promise<void> => {
  await nextTick();
  for (const v of unref(visitedViews)) {
    if (v.fullPath === unref(currentRoute).path) {
      moveToTarget(v as RouteLocationNormalizedLoaded);
      if (v.fullPath !== unref(currentRoute).fullPath) {
        store.updateVisitedView(unref(currentRoute));
      }
      break;
    }
  }
};

/** 标签页链接元素引用列表 */
const tagLinksRefs = ref<RouterLinkProps[]>([]);

/**
 * 滚动到目标标签页位置
 * 根据目标标签页的位置决定滚动策略
 *
 * @param currentTag - 目标标签页
 */
const moveToTarget = (currentTag: RouteLocationNormalizedLoaded): void => {
  const wrap$ = unref(scrollbarRef)?.wrapRef;
  let firstTag: RouterLinkProps | null = null;
  let lastTag: RouterLinkProps | null = null;

  const tagList = unref(tagLinksRefs);

  if (tagList.length > 0) {
    firstTag = tagList[0];
    lastTag = tagList[tagList.length - 1];
  }

  if ((firstTag?.to as RouteLocationNormalizedLoaded)?.fullPath === currentTag?.fullPath) {
    const { start } = useScrollTo({
      el: wrap$!,
      position: 'scrollLeft',
      to: 0,
      duration: 500
    });
    start();
  } else if ((lastTag?.to as RouteLocationNormalizedLoaded)?.fullPath === currentTag?.fullPath) {
    const { start } = useScrollTo({
      el: wrap$!,
      position: 'scrollLeft',
      to: wrap$!.scrollWidth - wrap$!.offsetWidth,
      duration: 500
    });
    start();
  } else {
    const currentIndex: number = tagList.findIndex(
      (item) => (item?.to as RouteLocationNormalizedLoaded)?.fullPath === currentTag?.fullPath
    );
    const tgsRefs = document.getElementsByClassName(`tags-view-item`);

    const prevTag = tgsRefs[currentIndex - 1] as HTMLElement;
    const nextTag = tgsRefs[currentIndex + 1] as HTMLElement;

    const afterNextTagOffsetLeft = nextTag.offsetLeft + nextTag.offsetWidth + 4;
    const beforePrevTagOffsetLeft = prevTag.offsetLeft - 4;

    if (afterNextTagOffsetLeft > unref(scrollLeftNumber) + wrap$!.offsetWidth) {
      const { start } = useScrollTo({
        el: wrap$!,
        position: 'scrollLeft',
        to: afterNextTagOffsetLeft - wrap$!.offsetWidth,
        duration: 500
      });
      start();
    } else if (beforePrevTagOffsetLeft < unref(scrollLeftNumber)) {
      const { start } = useScrollTo({
        el: wrap$!,
        position: 'scrollLeft',
        to: beforePrevTagOffsetLeft,
        duration: 500
      });
      start();
    }
  }
};

/**
 * 刷新当前标签页
 * 页签已全部关闭时无页可刷，直接忽略点击
 *
 * @param view - 需要刷新的标签页
 */
const refreshSelectedTag = function (view: TagView): void {
  store.refreshVisitedView(view);
};

/**
 * 关闭其他标签页
 */
const closeOthersTags = (): void => {
  store.delOthersVisitedViews(currentRoute);
};

/**
 * 关闭所有标签页
 */
const closeAllTags = (): void => {
  store.delAllVisitedViews();
};

/**
 * 获取标签页标题
 * 支持动态参数标题（如：详情-123）
 *
 * @param tag - 标签页信息
 * @returns 标题文本
 */
const getTitle = function (tag: TagView): string | undefined {
  if (tag.meta?.paramsTitle) {
    const paramsTitle = tag.meta.paramsTitle as string;
    if (tag.params && paramsTitle in tag.params) {
      return `${tag.meta.title}-${tag.params[paramsTitle]}`;
    }
  }
  return tag.meta?.title as string | undefined;
};

watch(props.currentRoute, async (newVal) => {
  addTags(newVal);
  moveToCurrentTag();
});

/**
 * 关闭最后一个标签页后路由并未变化，再点击当前菜单不会产生导航，
 * 上面的 watch 不触发、标签补不回来，内容区会一直空白。
 * 重复导航（duplicated）仍会执行 afterEach，借此补回当前标签。
 */
const stopAfterEach = router.afterEach((to, _from, failure) => {
  if (isNavigationFailure(failure, NavigationFailureType.duplicated)) {
    addTags(to);
  }
});

onMounted(() => {
  addTags(currentRoute);
});

onBeforeUnmount(stopAfterEach);
</script>

<template>
  <div class="tags-view-container">
    <div class="tags-view-wrapper">
      <div class="view-box">
        <div class="view-arrow view-left" @click="move(-200)">
          <el-icon class="view-icon">
            <ArrowLeft />
          </el-icon>
        </div>
        <div class="view-content">
          <el-scrollbar class="view-content-wrapper" @scroll="scroll" ref="scrollbarRef">
            <div class="tags-view-item-box">
              <router-link
                v-for="tag in visitedViews"
                :key="tag.path"
                custom
                v-slot="{ navigate }"
                :to="tag"
                ref="tagLinksRefs"
              >
                <span
                  @click="navigate"
                  class="tags-view-item"
                  :class="isActive(tag) ? 'active' : ''"
                >
                  {{ getTitle(tag) }}
                  <el-icon
                    size="14"
                    color="#98A4B2"
                    class="view-circle"
                    @click.prevent.stop="closeSelectedTag(tag)"
                  >
                    <CirclePlusFilled />
                  </el-icon>
                </span>
              </router-link>
            </div>
          </el-scrollbar>
        </div>
        <div class="view-arrow view-right" @click="move(200)">
          <el-icon class="view-icon">
            <ArrowRight />
          </el-icon>
        </div>
        <div
          class="view-arrow"
          :class="{ 'is-disabled': !visitedViews.length }"
          @click="refreshSelectedTag(currentRoute)"
        >
          <el-icon class="view-icon">
            <RefreshRight />
          </el-icon>
        </div>
        <el-dropdown trigger="click">
          <div class="view-arrow">
            <el-icon class="view-icon">
              <Setting />
            </el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                :disabled="!visitedViews.length"
                @click="refreshSelectedTag(currentRoute)"
              >
                <el-icon class="view-drop-icon">
                  <Refresh />
                </el-icon>
                重新加载
              </el-dropdown-item>
              <el-dropdown-item @click="closeSelectedTag(currentRoute)">
                <el-icon class="view-drop-icon">
                  <CloseBold />
                </el-icon>
                关闭标签页
              </el-dropdown-item>
              <el-dropdown-item @click="closeOthersTags">
                <el-icon class="view-drop-icon">
                  <Crop />
                </el-icon>
                关闭其它标签页
              </el-dropdown-item>
              <el-dropdown-item @click="closeAllTags">
                <el-icon class="view-drop-icon">
                  <SemiSelect />
                </el-icon>
                关闭全部标签页
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tags-view-container {
  margin-bottom: 2px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.tags-view-wrapper {
  height: var(--zm-tags-view-height);
}

.view-box {
  height: 100%;
  display: flex;
}

.view-arrow {
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  cursor: pointer;
  color: #222222;
}

.view-arrow.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.view-left {
  border-top-left-radius: 6px;
}

.view-right {
  border-top-right-radius: 6px;
}

.view-content {
  flex: 1;
  background: #fff;
  overflow: hidden;
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.tags-view-item-box {
  display: flex;
  padding-top: 2px;
  background: #eff6ff;
  box-sizing: border-box;
  height: 100%;
}

.tags-view-item {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  position: relative;
  cursor: pointer;
  height: 100%;
  color: #222222;
  background: #eff6ff;
  padding: 0 36px 0 20px;
  font-size: var(--el-font-size-base);
  letter-spacing: 1px;
  border-top-right-radius: 6px;
  border-top-left-radius: 6px;
  text-align: left;
  width: auto;
}

.tags-view-item.active {
  background-color: #ffffff;
  color: #222222;
}

.view-circle {
  position: absolute;
  right: 12px;
  transform: rotate(45deg);
}

.view-icon {
  color: #222;
}
.view-drop-icon {
  color: #178fd2;
}
</style>
