/**
 * 页面缓存管理 Store
 *
 * 核心职责：
 *   1. 管理一级路由和二级路由的 keep-alive 缓存列表
 *   2. 提供添加/移除缓存路由的方法
 *
 * 特殊说明：
 *   - firstKeepAliveRoute: 一级路由缓存（对应 layout 视图）
 *   - secondKeepAliveRoute: 二级路由缓存（对应业务页面视图）
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useKeepAliveStore = defineStore('KeepAlive', () => {
  /** 一级路由缓存列表 */
  const firstKeepAliveRoute = ref<string[]>([]);
  /** 二级路由缓存列表 */
  const secondKeepAliveRoute = ref<string[]>([]);

  /**
   * 将路由名称添加到缓存列表
   * 如果已存在则不重复添加
   *
   * @param keepAliveRoute - 缓存列表引用
   * @param name - 需要缓存的路由名称
   */
  function setKeepAlive(keepAliveRoute: string[], name: string): void {
    if (!keepAliveRoute.includes(name)) {
      keepAliveRoute.push(name);
    }
  }

  /**
   * 从缓存列表中移除路由名称
   *
   * @param keepAliveRoute - 缓存列表引用
   * @param name - 需要移除的路由名称
   */
  function setNoKeepAlive(keepAliveRoute: string[], name: string): void {
    const index = keepAliveRoute.indexOf(name);
    if (index !== -1) {
      keepAliveRoute.splice(index, 1);
    }
  }

  return {
    firstKeepAliveRoute,
    secondKeepAliveRoute,
    setKeepAlive,
    setNoKeepAlive
  };
});
