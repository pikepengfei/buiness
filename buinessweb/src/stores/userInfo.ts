/**
 * 用户信息管理 Store
 *
 * 核心职责：
 *   1. 管理用户登录信息和菜单树数据
 *   2. 菜单树采用本地静态「官网管理」菜单（src/stores/adminMenu.ts），
 *     模板演示页（feiyong/huoyuan 等）不再挂菜单
 *
 * 特殊说明：
 *   - 接真实权限菜单时，在 setUserInfo 中改调后端接口并合并前端配置字段
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MenuItem, UserInfoResponse } from '@/types/global';

import { websiteAdminMenu } from './adminMenu';

export const useUserInfoStore = defineStore('UserInfo', () => {
  /** 用户信息 */
  const userInfo = ref<UserInfoResponse | null>(null);
  /** 菜单树数据：静态初始化为「官网管理」菜单 */
  const menuTree = ref<MenuItem[]>(JSON.parse(JSON.stringify(websiteAdminMenu)));

  /**
   * 获取用户信息并填充菜单树
   * 当前为静态菜单；接真实项目时改为后端接口返回并合并前端配置字段
   *
   * @returns 用户信息
   */
  function setUserInfo(): Promise<UserInfoResponse> {
    const res: UserInfoResponse = {
      menuTree: JSON.parse(JSON.stringify(websiteAdminMenu)),
      buttonList: []
    };
    userInfo.value = res;
    menuTree.value = res.menuTree ?? [];
    return Promise.resolve(userInfo.value);
  }

  return {
    userInfo,
    setUserInfo,
    menuTree
  };
});
