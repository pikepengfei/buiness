/**
 * 标签页视图管理 Store
 *
 * 核心职责：
 *   1. 管理已访问的标签页列表（visitedViews）
 *   2. 提供标签页的增删改操作
 *   3. 关联 keepAlive 缓存，关闭标签时同步移除缓存
 *
 * 特殊说明：
 *   - 关闭标签页时会同步清除对应的 keep-alive 缓存
 *   - visitedViews 用于渲染顶部标签栏
 *   - refreshSeed 供布局层作为页面组件 key 的一部分，递增即可重建当前页面
 */
import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { useKeepAliveStore } from '@/stores/keepAlive';
import type { TagView } from '@/types/global';

export const useTagsViewStore = defineStore('TagsView', () => {
  /** 已访问的标签页列表 */
  const visitedViews: Ref<TagView[]> = ref([]);
  /** 页面重建计数：递增后布局层重新挂载当前页面组件 */
  const refreshSeed = ref(0);

  /**
   * 添加标签页
   * 如果该路径已存在则不重复添加
   *
   * @param view - 路由信息
   * @returns 是否添加成功（true=新增，false=已存在）
   */
  function setTagsView(view: TagView): boolean {
    const isHasView: boolean = visitedViews.value.some((v: TagView) => {
      return v.path === view.path;
    });

    if (isHasView) {
      return false;
    }
    visitedViews.value.push(Object.assign({}, view));
    return true;
  }

  /**
   * 删除标签页
   * 关闭页签时同步移除 keep-alive 缓存
   *
   * @param view - 需要删除的标签页路由信息
   * @returns 删除后的标签页列表
   */
  function delTagsView(view: TagView): Promise<TagView[]> {
    const keepStroe = useKeepAliveStore();
    if (view?.name && typeof view.name === 'string') {
      keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, view.name);
    }
    return new Promise((resolve) => {
      for (const [i, v] of visitedViews.value.entries()) {
        if (v.path === view.path) {
          visitedViews.value.splice(i, 1);
          break;
        }
      }
      resolve(visitedViews.value);
    });
  }

  /**
   * 重新加载标签页对应的页面
   * 不走 /redirect 路由跳转，改为递增 refreshSeed 让布局层重建页面组件；
   * 页签不存在（如页签已全部关闭）时不执行
   *
   * @param view - 需要刷新的标签页路由信息
   * @returns 是否执行了刷新
   */
  function refreshVisitedView(view: TagView): boolean {
    if (!view?.path || !visitedViews.value.some((v) => v.path === view.path)) {
      return false;
    }
    const keepStroe = useKeepAliveStore();
    if (view?.name && typeof view.name === 'string') {
      keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, view.name);
    }
    refreshSeed.value += 1;
    return true;
  }

  /**
   * 关闭其它标签页
   * 只保留当前标签页，其余标签页及其缓存全部移除
   *
   * @param view - 需要保留的标签页路由信息
   */
  function delOthersVisitedViews(view: TagView): void {
    const keepStroe = useKeepAliveStore();
    visitedViews.value = visitedViews.value.filter((v) => {
      if (v.path !== view.path && v?.name && typeof v.name === 'string') {
        keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, v.name);
      }
      return v.path === view.path;
    });
  }

  /**
   * 关闭所有标签页
   * 标签页及其 keep-alive 缓存全部移除
   */
  function delAllVisitedViews(): void {
    const keepStroe = useKeepAliveStore();
    visitedViews.value.forEach((v) => {
      if (v?.name && typeof v.name === 'string') {
        keepStroe.setNoKeepAlive(keepStroe.secondKeepAliveRoute, v.name);
      }
    });
    visitedViews.value = [];
  }

  /**
   * 更新标签页信息
   * 当路由参数变化时更新已有标签页的数据
   *
   * @param view - 最新的路由信息
   */
  function updateVisitedView(view: TagView): void {
    const index = visitedViews.value.findIndex((v) => v.path === view.path);
    if (index !== -1) {
      visitedViews.value[index] = Object.assign({}, visitedViews.value[index], view);
    }
  }

  return {
    visitedViews,
    refreshSeed,
    setTagsView,
    delTagsView,
    refreshVisitedView,
    delOthersVisitedViews,
    delAllVisitedViews,
    updateVisitedView
  };
});
