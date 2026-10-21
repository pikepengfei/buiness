/**
 * 全局类型定义
 *
 * 核心职责：
 *   1. 定义项目中通用的 TypeScript 类型/接口
 *   2. 供 stores、router、components 等模块复用
 */
import type { RouteLocationNormalizedLoadedGeneric } from 'vue-router';
import type { Component } from 'vue';
import type { EChartsOption } from 'echarts';

/** 菜单项数据结构 */
export interface MenuItem {
  name?: string;
  url: string;
  id?: number | string;
  icon?: string;
  hidden?: boolean;
  type?: number;
  children?: MenuItem[];
  filePath?: Component | (() => Promise<{ default: Component }>);
  filePathName?: string;
  props?: Record<string, unknown>;
  cached?: boolean;
  activeMenu?: string;
  activePopoverMenu?: string;
  paramsTitle?: string;
  noTagsView?: boolean;
  isFavorite?: boolean;
  [key: string]: unknown;
}

/** 按钮权限信息 */
export interface ButtonInfo {
  customCode: string;
  parentId: number | string;
  [key: string]: unknown;
}

/** 用户信息接口响应结构 */
export interface UserInfoResponse {
  menuTree: MenuItem[];
  buttonList: ButtonInfo[];
  name?: string;
  [key: string]: unknown;
}

/** 标签页视图类型，复用 vue-router 的路由信息 */
export type TagView = RouteLocationNormalizedLoadedGeneric;

/** 表格行数据结构 */
export interface TableRow {
  code: string;
  type: string;
  date: string;
  amount: number;
  apply: string;
}

/** ECharts 配置类型别名 */
export type ECOption = EChartsOption;
