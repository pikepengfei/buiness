import axios from 'axios';
import type {
  ApiResult, Paginated, SiteConfig, Banner, ProductSummary, ProductDetail, ProductCategory,
  ArticleSummary, ArticleDetail, ArticleCategory, Page, Faq, AuthUser, LoginPayload,
  InquiryPayload, CooperationPayload, SubscriptionPayload, ContactPayload,
  PageListRow, ProductAdminRow, ArticleAdminRow, BannerAdminRow, MediaItem,
  LeadRow, UserRow, RoleRow, AuditRow, SettingsGrouped, MenuItem,
} from '@/types/cms';
import { passwordDigest } from '@/utils/password';

const BASE_URL = (import.meta.env.VITE_API_BASE as string) || '/api';

/** 支持批量排序的资源（与 backend/src/routes/content.ts 的 registerReorder 注册项一致） */
export type ReorderResource = 'banners' | 'faqs' | 'menus' | 'product-categories' | 'article-categories';

const http = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// 请求拦截：携带 JWT
http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('Authorization');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
// 响应拦截：统一解包
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // 令牌失效，清理登录态；管理后台页面自动跳转登录页（带 redirect）
      localStorage.removeItem('Authorization');
      localStorage.removeItem('RefreshToken');
      const path = window.location.pathname || '';
      if (path.startsWith('/admin') && path !== '/login') {
        const redirect = encodeURIComponent(path + (window.location.search || ''));
        window.location.href = `/login?redirect=${redirect}`;
      }
    }
    return Promise.reject(err);
  }
);

// 口令 helper：body 里带 password 时统一替换为 SHA-256 摘要，接口不提交明文
function withPasswordDigest<T extends Record<string, unknown>>(body: T): T {
  const password = body['password'];
  return typeof password === 'string' && password
    ? { ...body, password: passwordDigest(password) }
    : body;
}

// 解包 helper：直接返回 data 字段
async function unwrap<T>(p: Promise<{ data: ApiResult<T> }>): Promise<T> {
  const { data } = await p;
  if (data.code !== 0) throw new Error(data.message || '请求失败');
  return data.data;
}

// 解包 helper：分页接口返回 list + 总数 + 其余 meta 面（如 media 的 categories）
async function unwrapPaged<T>(p: Promise<{ data: ApiResult<T> }>): Promise<{ list: T; page: number; pageSize: number; total: number; meta: NonNullable<ApiResult<T>['meta']> }> {
  const { data } = await p;
  if (data.code !== 0) throw new Error(data.message || '请求失败');
  return {
    list: data.data,
    page: data.meta?.page ?? 1,
    pageSize: data.meta?.pageSize ?? 20,
    total: data.meta?.total ?? 0,
    meta: data.meta ?? { page: 1, pageSize: 20, total: 0 },
  };
}

// ------------------------- 公开只读接口 -------------------------
export const cms = {
  getSite: () => unwrap<SiteConfig>(http.get('/public/site')),
  getBanners: (position = 'home') => unwrap<Banner[]>(http.get('/public/banners', { params: { position } })),
  getProducts: (params: Record<string, any> = {}) =>
    unwrap<{ rows: ProductSummary[] }>(http.get('/public/products', { params })).then((r) => r as any),
  getProductsPaged: async (params: Record<string, any> = {}) => {
    const res = await http.get('/public/products', { params });
    return res.data as ApiResult<ProductSummary[]> | any;
  },
  getProduct: (slug: string) => unwrap<ProductDetail>(http.get(`/public/products/${slug}`)),
  getProductCategories: () => unwrap<ProductCategory[]>(http.get('/public/product-categories')),
  getArticles: (params: Record<string, any> = {}) => http.get('/public/articles', { params }),
  getArticle: (slug: string) => unwrap<ArticleDetail>(http.get(`/public/articles/${slug}`)),
  getArticleCategories: () => unwrap<ArticleCategory[]>(http.get('/public/article-categories')),
  getPage: (slug: string) => unwrap<Page | null>(http.get(`/public/pages/${slug}`)),
  getFaqs: (category?: string) => unwrap<Faq[]>(http.get('/public/faqs', { params: category ? { category } : {} })),
  search: (q: string) => unwrap<{ products: ProductSummary[]; articles: ArticleSummary[] }>(http.get('/public/search', { params: { q } })),
};

// ------------------------- 管理端接口（需登录 + 对应权限点） -------------------------
// 路径与 backend/src/routes/{content,forms,upload,users}.ts 一一对齐
export const cmsAdmin = {
  // 页面装修：草稿/发布双版本
  pages: {
    list: () => unwrapPaged<PageListRow[]>(http.get('/pages')),
    bySlug: (slug: string) => unwrap<Page>(http.get(`/pages/by-slug/${slug}`)),
    get: (id: number) => unwrap<Page>(http.get(`/pages/${id}`)),
    create: (body: { slug: string; title: string; contentJson?: any }) => unwrap<{ id: number }>(http.post('/pages', body)),
    updateMeta: (id: number, body: { title?: string; metaTitle?: string; metaDescription?: string; heroImage?: string }) =>
      unwrap(http.patch(`/pages/${id}`, body)),
    saveDraft: (id: number, contentJson: any) => unwrap(http.put(`/pages/${id}/draft`, { contentJson })),
    // 放弃草稿：清空 draft_json，编辑器回落线上版本
    discardDraft: (id: number) => unwrap(http.delete(`/pages/${id}/draft`)),
    publish: (id: number) => unwrap(http.post(`/pages/${id}/publish`)),
    unpublish: (id: number) => unwrap(http.post(`/pages/${id}/unpublish`)),
    remove: (id: number) => unwrap(http.delete(`/pages/${id}`)),
  },
  // 产品
  products: {
    list: (params: Record<string, any> = {}) => unwrapPaged<ProductAdminRow[]>(http.get('/products', { params })),
    get: (id: number) => unwrap<ProductAdminRow>(http.get(`/products/${id}`)),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/products', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/products/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/products/${id}`)),
  },
  productCategories: {
    list: () => unwrap<ProductCategory[]>(http.get('/product-categories')),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/product-categories', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/product-categories/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/product-categories/${id}`)),
  },
  // 资讯
  articles: {
    list: (params: Record<string, any> = {}) => unwrapPaged<ArticleAdminRow[]>(http.get('/articles', { params })),
    get: (id: number) => unwrap<ArticleAdminRow>(http.get(`/articles/${id}`)),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/articles', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/articles/${id}`, body)),
    publish: (id: number) => unwrap(http.post(`/articles/${id}/publish`)),
    // 下线：status=2，官网不再展示
    unpublish: (id: number) => unwrap(http.post(`/articles/${id}/unpublish`)),
    remove: (id: number) => unwrap(http.delete(`/articles/${id}`)),
  },
  articleCategories: {
    list: () => unwrap<ArticleCategory[]>(http.get('/article-categories')),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/article-categories', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/article-categories/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/article-categories/${id}`)),
  },
  // Banner
  banners: {
    list: () => unwrap<BannerAdminRow[]>(http.get('/banners')),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/banners', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/banners/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/banners/${id}`)),
  },
  // FAQ
  faqs: {
    list: () => unwrap<(Faq & { sort?: number; status?: number })[]>(http.get('/faqs')),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/faqs', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/faqs/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/faqs/${id}`)),
  },
  // 站点设置（group → key → {value,label}）
  settings: {
    get: () => unwrap<SettingsGrouped>(http.get('/settings')),
    update: (items: { key: string; value: string; groupName?: string; label?: string }[]) => unwrap(http.patch('/settings', items)),
  },
  // 导航菜单（树）
  menus: {
    tree: () => unwrap<MenuItem[]>(http.get('/menus')),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/menus', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/menus/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/menus/${id}`)),
  },
  // 媒体库与上传
  media: {
    list: (params: Record<string, any> = {}) => unwrapPaged<MediaItem[]>(http.get('/media', { params })),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/media', body)),
    // 改名 / 归类（不影响访问 URL）
    update: (id: number, body: { originalName?: string; category?: string }) => unwrap(http.patch(`/media/${id}`, body)),
    // 删除：后端会先扫描内容引用，被引用时返回 409
    remove: (id: number) => unwrap(http.delete(`/media/${id}`)),
    /** 本地存储模式服务端直传；成功后同步写入媒体库并返回 url */
    async uploadDirect(file: File, category = 'general') {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await http.post<ApiResult<{ id: number; url: string; objectKey: string }>>(
        '/upload/direct', fd, { params: { category } });
      if (data.code !== 0) throw new Error(data.message || '上传失败');
      return data.data;
    },
  },
  // 批量排序：整页 { id, sort } 一次提交，后端单事务写入
  reorder: (resource: ReorderResource, items: { id: number; sort: number }[]) =>
    unwrap<{ updated: number }>(http.post(`/${resource}/reorder`, { items })),
  // 转化线索（kind: inquiry 询价 / cooperation 合作 / contact 售后）
  leads: {
    list: (kind: 'inquiry' | 'cooperation' | 'contact', params: Record<string, any> = {}) =>
      unwrapPaged<LeadRow[]>(http.get(`/leads/${kind}`, { params })),
    update: (kind: 'inquiry' | 'cooperation' | 'contact', id: number, body: { status?: number; note?: string; handledBy?: string }) =>
      unwrap(http.patch(`/leads/${kind}/${id}`, body)),
    stats: () => unwrap<Record<string, any>>(http.get('/leads/stats')),
  },
  // 用户与角色
  users: {
    list: (params: Record<string, any> = {}) => unwrapPaged<UserRow[]>(http.get('/users', { params })),
    create: (body: Record<string, any>) => unwrap<{ id: number }>(http.post('/users', withPasswordDigest(body))),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/users/${id}`, withPasswordDigest(body))),
    remove: (id: number) => unwrap(http.delete(`/users/${id}`)),
  },
  roles: {
    list: () => unwrap<RoleRow[]>(http.get('/roles')),
  },
  // 审计日志
  audit: {
    list: (params: Record<string, any> = {}) => unwrapPaged<AuditRow[]>(http.get('/audit', { params })),
  },
};

// ------------------------- 鉴权 -------------------------
export const authApi = {
  // 调用方传入表单明文，此处摘要后才发请求，接口正文不含明文口令
  async login(payload: LoginPayload) {
    const { data } = await http.post<ApiResult<{ accessToken: string; refreshToken: string; user: AuthUser }>>('/auth/login', {
      ...payload,
      password: passwordDigest(payload.password),
    });
    if (data.code !== 0) throw new Error(data.message);
    localStorage.setItem('Authorization', data.data.accessToken);
    localStorage.setItem('RefreshToken', data.data.refreshToken);
    return data.data;
  },
  // 刷新令牌（后端采用轮换，会同时返回新 accessToken + refreshToken）
  async refresh(refreshToken: string) {
    const { data } = await http.post<ApiResult<{ accessToken: string; refreshToken: string }>>('/auth/refresh', { refreshToken });
    if (data.code !== 0) throw new Error(data.message);
    localStorage.setItem('Authorization', data.data.accessToken);
    localStorage.setItem('RefreshToken', data.data.refreshToken);
    return data.data;
  },
  logout: () => http.post('/auth/logout', { refreshToken: localStorage.getItem('RefreshToken') }).finally(() => {
    localStorage.removeItem('Authorization');
    localStorage.removeItem('RefreshToken');
  }),
  me: () => unwrap<AuthUser>(http.get('/auth/me')),
  changePassword: (oldPassword: string, newPassword: string) =>
    unwrap<null>(http.post('/auth/change-password', {
      oldPassword: passwordDigest(oldPassword),
      newPassword: passwordDigest(newPassword),
    })),
};

// ------------------------- 表单提交（公开） -------------------------
export const formApi = {
  submitInquiry: (p: InquiryPayload) => unwrap(http.post('/forms/inquiry', p)),
  submitCooperation: (p: CooperationPayload) => unwrap(http.post('/forms/cooperation', p)),
  submitSubscription: (p: SubscriptionPayload) => unwrap(http.post('/forms/subscription', p)),
  submitContact: (p: ContactPayload) => unwrap(http.post('/forms/contact', p)),
};

export default http;
