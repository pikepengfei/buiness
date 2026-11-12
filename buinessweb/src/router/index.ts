import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * 路由规划：
 *  - 根路径 `/` 起为企业官网（营销站），使用 WebsiteLayout，路径对应官网设计原型
 *  - `/login` 为运营后台登录页（全屏，独立于任何 Layout）
 *  - `/admin` 起为运营后台（沿用既有 admin 模板，作为 CMS 管理界面骨架），需登录
 *  - 任意未匹配路径 → 官网 Layout 内的品牌化 404
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layout/WebsiteLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/website/Home.vue'), meta: { title: '首页' } },
      { path: 'about', name: 'about', component: () => import('@/views/website/About.vue'), meta: { title: '关于我们' } },
      { path: 'products', name: 'products', component: () => import('@/views/website/products/index.vue'), meta: { title: '产品中心' } },
      { path: 'products/:slug', name: 'product-detail-legacy', component: () => import('@/views/website/products/detail.vue'), meta: { title: '产品详情' } },
      // 产品详情正式地址（数据结构文档定的 /product/:slug）。/products/:slug 的移除归 C1 第 3 组，此处两条并存、指向同一组件
      { path: 'product/:slug', name: 'product-detail', component: () => import('@/views/website/products/detail.vue'), meta: { title: '产品详情' } },
      { path: 'news', name: 'news', component: () => import('@/views/website/news/index.vue'), meta: { title: '新闻资讯' } },
      { path: 'news/:slug', name: 'article', component: () => import('@/views/website/news/detail.vue'), meta: { title: '资讯详情' } },
      // 资讯详情正式地址（数据结构文档定的 /article/:slug）。/news/:slug 的移除归 C1 第 3 组，此处两条并存、指向同一组件
      { path: 'article/:slug', name: 'article-detail', component: () => import('@/views/website/news/detail.vue'), meta: { title: '资讯详情' } },
      { path: 'contact', name: 'contact', component: () => import('@/views/website/Contact.vue'), meta: { title: '售后服务' } },
      { path: 'search', name: 'search', component: () => import('@/views/website/Search.vue'), meta: { title: '搜索' } },
      // 品牌化 404：置于官网 Layout 内，导航、页脚与 website.css 由 Layout 统一提供
      { path: 'preview/:slug', name: 'preview', component: () => import('@/views/website/Preview.vue'), meta: { title: '草稿预览', requiresAuth: true } },
      // 一级新增页（A 方案软通配）：必须排在兜底 404 之前。静态段记录优先级高于参数段，
      // 故 /about、/products 等固定页不会被抢；/product、/article 缺标识会命中这里并因查无页面落 404。
      // 不设 meta.title，避免 afterEach 的默认标题在真实标题写入前闪一帧。
      { path: ':slug', name: 'dynamic-page', component: () => import('@/views/website/CmsPage.vue') },
      { path: ':pathMatch(.*)*', name: 'notFound', component: () => import('@/views/website/NotFound.vue'), meta: { title: '404' } },
    ],
  },
  // 登录页（全屏独立，不套 Layout）
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', public: true },
  },
  // 运营后台（官网 CMS 管理，静态路由；path/name 与 src/stores/adminMenu.ts 菜单拼接规则对齐）
  {
    path: '/admin',
    component: () => import('@/views/layout/index.vue'),
    meta: { requiresAuth: true },
    children: [
      // 页面配置（一级菜单 /admin/pages）：/admin 重定向到页面装修列表；组件库为二级页；编辑器为隐藏页，高亮列表
      { path: '', redirect: '/admin/pages' },
      { path: 'pages', name: 'admin-pages-list', component: () => import('@/views/admin/website/pages/index.vue'), meta: { title: '页面装修', requiresAuth: true } },
      { path: 'pages/components', name: 'admin-pages-components', component: () => import('@/views/admin/website/pages/components.vue'), meta: { title: '组件库', requiresAuth: true } },
      { path: 'pages/editor/:slug', name: 'admin-pages-editor', component: () => import('@/views/admin/website/pages/editor.vue'), meta: { title: '页面装修编辑器', requiresAuth: true, activeMenu: 'admin-pages-list' } },
      // 内容中心（非首组：首叶 /admin/content，其余 /admin/content+叶url）
      { path: 'content', name: 'admin-content-products', component: () => import('@/views/admin/content/product/index.vue'), meta: { title: '产品管理', requiresAuth: true } },
      { path: 'content/products/edit/:id?', name: 'admin-content-products-edit', component: () => import('@/views/admin/content/product/edit.vue'), meta: { title: '编辑产品', requiresAuth: true, activeMenu: 'admin-content-products' } },
      { path: 'content/product-categories', name: 'admin-content-product-categories', component: () => import('@/views/admin/content/product/categories.vue'), meta: { title: '产品分类', requiresAuth: true } },
      { path: 'content/articles', name: 'admin-content-articles', component: () => import('@/views/admin/content/article/index.vue'), meta: { title: '资讯管理', requiresAuth: true } },
      { path: 'content/articles/edit/:id?', name: 'admin-content-articles-edit', component: () => import('@/views/admin/content/article/edit.vue'), meta: { title: '编辑资讯', requiresAuth: true, activeMenu: 'admin-content-articles' } },
      { path: 'content/article-categories', name: 'admin-content-article-categories', component: () => import('@/views/admin/content/article/categories.vue'), meta: { title: '资讯分类', requiresAuth: true } },
      // 官网配置（首叶 /admin/config）
      { path: 'config', name: 'admin-config-banners', component: () => import('@/views/admin/website/banners.vue'), meta: { title: 'Banner 管理', requiresAuth: true } },
      { path: 'config/menus', name: 'admin-config-menus', component: () => import('@/views/admin/website/menus.vue'), meta: { title: '导航菜单', requiresAuth: true } },
      { path: 'config/settings', name: 'admin-config-settings', component: () => import('@/views/admin/website/settings.vue'), meta: { title: '站点设置', requiresAuth: true } },
      { path: 'config/faqs', name: 'admin-config-faqs', component: () => import('@/views/admin/website/faqs.vue'), meta: { title: 'FAQ 管理', requiresAuth: true } },
      // 转化线索 / 素材中心（单叶提级 → /admin+组url）
      { path: 'leads', name: 'admin-leads-list', component: () => import('@/views/admin/leads/index.vue'), meta: { title: '线索管理', requiresAuth: true } },
      { path: 'media', name: 'admin-media-list', component: () => import('@/views/admin/media/index.vue'), meta: { title: '素材库', requiresAuth: true } },
      // 系统管理（首叶 /admin/system）
      { path: 'system', name: 'admin-system-users', component: () => import('@/views/admin/system/users.vue'), meta: { title: '用户管理', requiresAuth: true } },
      { path: 'system/audit', name: 'admin-system-audit', component: () => import('@/views/admin/system/audit.vue'), meta: { title: '审计日志', requiresAuth: true } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // 官网整页滚动发生在 window 上，vue-router 默认不接管：进入新页面会沿用上一页的偏移，
  // 刷新时浏览器自身的位置还原（history.scrollRestoration=auto）也会把视口停在页面中间。
  // 传入该配置后 vue-router 会自行把 scrollRestoration 置为 manual，并在首次加载时也执行一次，
  // 因此点击跳转、直接打开、刷新三条路都从顶部开始——忽略 savedPosition，前进/后退同样回顶。
  // behavior 必须显式给 instant：website.css 里 html{scroll-behavior:smooth} 会把回顶渲染成可见的滑动动画，
  // 而 window.scrollTo 的入参优先级高于该 CSS。
  scrollBehavior: () => ({ top: 0, left: 0, behavior: 'instant' }),
});

/**
 * 全局前置守卫：
 *  - 未登录访问 requiresAuth → 跳 /login?redirect=目标
 *  - 已登录访问 /login → 跳 /admin（或 redirect 参数）
 *  - 已登录但 store.user 未加载时，拉一次 /auth/me 验证令牌有效性
 *    · 若 401，axios 拦截器会清理 tokens 并跳转 /login
 *    · 若网络异常，保留 tokens 允许离线访问，不强行踢出
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  const requires = to.matched.some((r) => r.meta.requiresAuth === true);
  const isLoginPage = to.path === '/login';

  // 目标需要登录，且本地无令牌 → 直接跳登录
  if (requires && !auth.isLogged) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 已登录访问登录页 → 回到后台首页
  if (isLoginPage && auth.isLogged) {
    const r = (to.query.redirect as string) || '/admin';
    return r.startsWith('/') && !r.startsWith('//') ? r : '/admin';
  }

  // 已登录但用户信息缺失：拉一次 /auth/me 填充；失败让 axios 拦截器接管
  if (requires && auth.isLogged && !auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      /* 拦截器已清理并跳转 */
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }

  return true;
});

// 路由切换同步浏览器标签标题（不匹配时回退到 index.html 默认值）
const BRAND = 'Centremix 芯联创';
router.afterEach((to) => {
  const pageTitle = (to.meta?.title as string) || '';
  document.title = pageTitle ? `${pageTitle} · ${BRAND}` : BRAND;
});

export default router;
