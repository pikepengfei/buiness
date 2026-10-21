import type { MenuItem } from '@/types/global';

interface ContainerRoute {
  path: string;
  name: string;
  meta: Record<string, unknown>;
  children: RouteNode[];
}

interface LeafRoute {
  path: string;
  name: string;
  component: unknown;
  props?: Record<string, unknown>;
  meta: Record<string, unknown>;
}

type RouteNode = ContainerRoute | LeafRoute;

const viewModules = import.meta.glob<{ default: unknown }>('../views/**/*.vue');

/**
 * 过滤掉外链菜单项，并递归处理子菜单
 *
 * @param items 菜单项数组
 * @returns 过滤后的菜单项数组
 */
function filterMenuItems(items: MenuItem[]): MenuItem[] {
  return items
    .filter((item) => {
      return !(
        item.url.startsWith('http://') ||
        item.url.startsWith('https://') ||
        item.url.startsWith('//')
      );
    })
    .map((item) => {
      if (item.children) {
        const filteredChildren = filterMenuItems(item.children);
        if (filteredChildren.length === 0) {
          const { ...rest } = item;
          delete (rest as Record<string, unknown>).children;
          return rest as MenuItem;
        }
        return {
          ...item,
          children: filteredChildren
        };
      }
      return item;
    });
}

/**
 * 获取路由名称，优先使用 filePathName，否则根据 URL 路径段拼接
 *
 * @param item 菜单项
 * @param urlSegments URL 路径段数组
 * @returns 路由名称
 */
const getRouteName = (item: MenuItem, urlSegments: string[]): string => {
  if (item.filePathName) return item.filePathName;
  return urlSegments.join('-');
};

/**
 * 获取路由组件，优先使用 filePath，否则根据 URL 路径段从 viewModules 中查找
 *
 * @param item 菜单项
 * @param urlSegments URL 路径段数组
 * @returns 路由组件
 */
const getRouteComponent = (item: MenuItem, urlSegments: string[]) => {
  if (item.filePath) return item.filePath;
  const path = `../views/${urlSegments.join('/')}/index.vue`;
  const module = viewModules[path];
  if (!module) {
    console.warn(`未找到视图组件: ${path}`);
    return undefined;
  }
  return module;
};

/**
 * 递归构建路由节点
 * Vue Router 嵌套路由中，第一个子路由 path 为空（继承父路由路径）
 *
 * @param item 菜单项
 * @param urlSegments 父级 URL 路径段数组
 * @param childIndex 在同级菜单中的索引
 * @returns 路由节点
 */
function buildRoute(item: MenuItem, urlSegments: string[], childIndex: number): RouteNode {
  const segment = item.url.replace('/', '');
  const currentSegments = [...urlSegments, segment];

  const path = childIndex === 0 ? '' : segment;
  const name = getRouteName(item, currentSegments);
  const meta = {
    title: item.name,
    hidden: item.hidden,
    keepAlive: Boolean(item.cached),
    activeMenu: item.activeMenu,
    paramsTitle: item.paramsTitle
  };

  if (item.children && item.children.length > 0) {
    return {
      path,
      name,
      meta,
      children: item.children.map((child, index) => buildRoute(child, currentSegments, index))
    };
  }

  return {
    path,
    name,
    component: getRouteComponent(item, currentSegments),
    props: item.props,
    meta: {
      ...meta,
      activePopoverMenu: item.activePopoverMenu,
      noTagsView: item.noTagsView
    }
  };
}

/**
 * 根据菜单数据动态创建路由配置
 *
 * @param data 菜单数据数组
 * @returns 路由配置数组
 */
const createDynamicRoute = function (data: MenuItem[]) {
  const arr = filterMenuItems(data);
  return arr.map((item) => {
    const parentPath = item.url ?? '';
    const segment = parentPath.replace('/', '');

    if (item.children && item.children.length > 0) {
      return {
        path: parentPath,
        name: segment,
        meta: {
          title: item.name,
          hidden: item.hidden,
          keepAlive: Boolean(item.cached),
          activeMenu: item.activeMenu
        },
        children: item.children.map((child, index) => buildRoute(child, [segment], index))
      };
    }

    return {
      path: parentPath,
      name: getRouteName(item, [segment]),
      component: getRouteComponent(item, [segment]),
      props: item.props,
      meta: {
        title: item.name,
        hidden: item.hidden,
        keepAlive: Boolean(item.cached),
        paramsTitle: item.paramsTitle,
        noTagsView: item.noTagsView,
        activeMenu: item.activeMenu
      }
    };
  });
};

export default createDynamicRoute;
