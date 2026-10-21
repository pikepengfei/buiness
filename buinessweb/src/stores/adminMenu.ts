/**
 * 管理端静态菜单树（官网管理）
 *
 * 说明：
 *   - 顶层仅一个分组「官网管理」（url '/admin'），layout 布局按路径前缀匹配；
 *   - 侧栏 menuTree 组件的路由/高亮由 url 片段拼接规则推导（见 menuTree/index.vue），
 *     路由 path 与 name 必须与该规则一致，修改菜单时务必同步 router/index.ts：
 *     · 首组（index 0）首叶 → path = /admin；其余叶 → /admin + 叶url
 *     · 非首组首叶 → path = /admin + 组url；其余叶 → /admin + 组url + 叶url
 *     · 叶子 name = 'admin' + '-' + 组url片段 + '-' + 叶url片段（- 拼接）
 *   - 隐藏页（编辑器/详情页）不进菜单，通过路由 meta.activeMenu 高亮所属菜单项。
 */
import type { MenuItem } from '@/types/global';

export const websiteAdminMenu: MenuItem[] = [
  {
    id: 'admin',
    name: '官网管理',
    url: '/admin',
    icon: 'icon-caiwu',
    children: [
      {
        id: 'admin-pages',
        name: '页面装修',
        url: '/pages',
        icon: 'icon-caiwu',
        children: [{ id: 'admin-pages-list', name: '页面列表', url: '/list' }],
      },
      {
        id: 'admin-content',
        name: '内容中心',
        url: '/content',
        icon: 'icon-huoyuan',
        children: [
          { id: 'admin-content-products', name: '产品管理', url: '/products' },
          { id: 'admin-content-product-categories', name: '产品分类', url: '/product-categories' },
          { id: 'admin-content-articles', name: '资讯管理', url: '/articles' },
          { id: 'admin-content-article-categories', name: '资讯分类', url: '/article-categories' },
        ],
      },
      {
        id: 'admin-config',
        name: '官网配置',
        url: '/config',
        icon: 'icon-caiwu',
        children: [
          { id: 'admin-config-banners', name: 'Banner 管理', url: '/banners' },
          { id: 'admin-config-menus', name: '导航菜单', url: '/menus' },
          { id: 'admin-config-settings', name: '站点设置', url: '/settings' },
          { id: 'admin-config-faqs', name: 'FAQ 管理', url: '/faqs' },
        ],
      },
      {
        id: 'admin-leads',
        name: '转化线索',
        url: '/leads',
        icon: 'icon-huoyuan',
        children: [{ id: 'admin-leads-list', name: '线索管理', url: '/list' }],
      },
      {
        id: 'admin-media',
        name: '素材中心',
        url: '/media',
        icon: 'icon-caiwu',
        children: [{ id: 'admin-media-list', name: '素材库', url: '/list' }],
      },
      {
        id: 'admin-system',
        name: '系统管理',
        url: '/system',
        icon: 'icon-huoyuan',
        children: [
          { id: 'admin-system-users', name: '用户管理', url: '/users' },
          { id: 'admin-system-audit', name: '审计日志', url: '/audit' },
        ],
      },
    ],
  },
];
