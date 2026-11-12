/**
 * 管理端静态菜单树（官网 CMS）
 *
 * 层级（导航重构后）：
 *   - 顶层 6 个一级菜单直接渲染在顶部导航：页面配置 / 内容中心 / 官网配置 / 转化线索 / 素材中心 / 系统管理；
 *     原「官网管理」单一分组与硬编码「查看官网」tab 已移除（查看官网降为右上角小入口）。
 *   - 每个一级菜单的 children 即其左侧二级页面（扁平叶子，不再嵌套分组）。
 *   - layout 按路径前缀匹配当前一级菜单（见 layout/index.vue），故一级 url 互不为前缀。
 *
 * 侧栏 menuTree 的路由/高亮由 url 片段拼接规则推导（见 menuTree/index.vue），
 * 路由 path 与 name 必须与该规则一致，修改菜单时务必同步 router/index.ts：
 *   · 基准 firstRouteUrl = 当前一级菜单 url（如 '/admin/pages'，可含多段）
 *   · 首叶（index 0）→ path = firstRouteUrl；其余叶 → path = firstRouteUrl + 叶url
 *   · 叶子 name = firstRouteUrl 与叶url 各片段用 '-' 拼接（内部 '/' 也归一为 '-'）
 *     例：firstRouteUrl '/admin/pages' + 叶 '/components' → name 'admin-pages-components'
 *   · 隐藏页（编辑器/详情页）不进菜单，通过路由 meta.activeMenu 高亮所属菜单项。
 *   - icon 取自 @element-plus/icons-vue 的组件名（main.ts 已全局注册），侧栏二级叶子使用。
 */
import type { MenuItem } from '@/types/global';

export const websiteAdminMenu: MenuItem[] = [
  {
    id: 'admin-pages',
    name: '页面配置',
    url: '/admin/pages',
    icon: 'Brush',
    children: [
      { id: 'admin-pages-list', name: '页面装修', url: '/list', icon: 'Brush' },
      { id: 'admin-pages-components', name: '组件库', url: '/components', icon: 'Grid' },
    ],
  },
  {
    id: 'admin-content',
    name: '内容中心',
    url: '/admin/content',
    icon: 'Document',
    children: [
      { id: 'admin-content-products', name: '产品管理', url: '/products', icon: 'Goods' },
      { id: 'admin-content-product-categories', name: '产品分类', url: '/product-categories', icon: 'Collection' },
      { id: 'admin-content-articles', name: '资讯管理', url: '/articles', icon: 'Document' },
      { id: 'admin-content-article-categories', name: '资讯分类', url: '/article-categories', icon: 'FolderOpened' },
    ],
  },
  {
    id: 'admin-config',
    name: '官网配置',
    url: '/admin/config',
    icon: 'Setting',
    children: [
      { id: 'admin-config-banners', name: 'Banner 管理', url: '/banners', icon: 'Picture' },
      { id: 'admin-config-menus', name: '导航菜单', url: '/menus', icon: 'Menu' },
      { id: 'admin-config-settings', name: '站点设置', url: '/settings', icon: 'Setting' },
      { id: 'admin-config-faqs', name: 'FAQ 管理', url: '/faqs', icon: 'QuestionFilled' },
    ],
  },
  {
    id: 'admin-leads',
    name: '转化线索',
    url: '/admin/leads',
    icon: 'TrendCharts',
    children: [{ id: 'admin-leads-list', name: '线索管理', url: '/list', icon: 'TrendCharts' }],
  },
  {
    id: 'admin-media',
    name: '素材中心',
    url: '/admin/media',
    icon: 'Picture',
    children: [{ id: 'admin-media-list', name: '素材库', url: '/list', icon: 'FolderOpened' }],
  },
  {
    id: 'admin-system',
    name: '系统管理',
    url: '/admin/system',
    icon: 'SetUp',
    children: [
      { id: 'admin-system-users', name: '用户管理', url: '/users', icon: 'User' },
      { id: 'admin-system-audit', name: '审计日志', url: '/audit', icon: 'Tickets' },
    ],
  },
];