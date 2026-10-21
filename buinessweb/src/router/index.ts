import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * 路由规划：
 *  - 根路径 `/` 起为企业官网（营销站），使用 WebsiteLayout，路径对应官网设计原型
 *  - `/login` 为运营后台登录页（全屏，独立于任何 Layout）
 *  - `/admin` 起为运营后台（沿用既有 admin 模板，作为 CMS 管理界面骨架），需登录
 *  - 任意未匹配路径 → 品牌化 404
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layout/WebsiteLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/website/Home.vue'), meta: { title: '首页' } },
      { path: 'about', name: 'about', component: () => import('@/views/website/About.vue'), meta: { title: '关于我们' } },
      { path: 'products', name: 'products', component: () => import('@/views/website/Products.vue'), meta: { title: '产品中心' } },
      { path: 'products/:slug', name: 'product-detail', component: () => import('@/views/website/ProductDetail.vue'), meta: { title: '产品详情' } },
      { path: 'news', name: 'news', component: () => import('@/views/website/News.vue'), meta: { title: '新闻咨询' } },
      { path: 'news/:slug', name: 'article', component: () => import('@/views/website/Article.vue'), meta: { title: '资讯详情' } },
      { path: 'contact', name: 'contact', component: () => import('@/views/website/Contact.vue'), meta: { title: '售后服务' } },
      { path: 'search', name: 'search', component: () => import('@/views/website/Search.vue'), meta: { title: '搜索' } },
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
      // 页面装修（首组首叶 → /admin 即页面列表；编辑器为隐藏页，高亮列表）
      { path: '', name: 'admin-pages-list', component: () => import('@/views/admin/website/pages/index.vue'), meta: { title: '页面装修', requiresAuth: true } },
      { path: 'pages/editor/:slug', name: 'admin-pages-editor', component: () => import('@/views/admin/website/pages/editor.vue'), meta: { title: '页面装修编辑器', requiresAuth: true, activeMenu: 'admin-pages-list' } },
      // 内容中心（非首组：首叶 /admin/content，其余 /admin/content+叶url）
      { path: 'content', name: 'admin-content-products', component: () => import('@/views/admin/content/products.vue'), meta: { title: '产品管理', requiresAuth: true } },
      { path: 'content/products/edit/:id?', name: 'admin-content-products-edit', component: () => import('@/views/admin/content/product-edit.vue'), meta: { title: '编辑产品', requiresAuth: true, activeMenu: 'admin-content-products' } },
      { path: 'content/product-categories', name: 'admin-content-product-categories', component: () => import('@/views/admin/content/product-categories.vue'), meta: { title: '产品分类', requiresAuth: true } },
      { path: 'content/articles', name: 'admin-content-articles', component: () => import('@/views/admin/content/articles.vue'), meta: { title: '资讯管理', requiresAuth: true } },
      { path: 'content/articles/edit/:id?', name: 'admin-content-articles-edit', component: () => import('@/views/admin/content/article-edit.vue'), meta: { title: '编辑资讯', requiresAuth: true, activeMenu: 'admin-content-articles' } },
      { path: 'content/article-categories', name: 'admin-content-article-categories', component: () => import('@/views/admin/content/article-categories.vue'), meta: { title: '资讯分类', requiresAuth: true } },
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
  // 品牌化 404
  { path: '/:pathMatch(.*)*', name: 'notFound', component: () => import('@/views/website/NotFound.vue'), meta: { title: '404' } },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
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
