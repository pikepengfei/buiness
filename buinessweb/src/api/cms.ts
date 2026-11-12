import axios from 'axios';
import type {
  ApiResult, Paginated, SiteConfig, Banner, ProductSummary, ProductDetail, ProductCategory,
  ArticleSummary, ArticleDetail, ArticleCategory, ArticleAdminRow, ArticleEditable,
  ArticleDraftPayload, ArticleCategoryAdminRow, Page, Faq, AuthUser, LoginPayload,
  InquiryPayload, CooperationPayload, SubscriptionPayload, ContactPayload,
  PageListRow, ProductAdminRow, ProductEditable, ProductDraftPayload,
  ProductCategoryAdminRow, ProductPublishResult, ProductUnpublishResult,
  BannerAdminRow, MediaItem, BlockTemplate, BlockCopyResult,
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
  // 与 getArticle 同形：不在架（草稿 / 已下架）与写错的标识都回 null，界面按「内容不存在」处理
  getProduct: (slug: string) => unwrap<ProductDetail | null>(http.get(`/public/products/${slug}`)),
  getProductCategories: () => unwrap<ProductCategory[]>(http.get('/public/product-categories')),
  // 与 getProductsPaged 同形：列表要同时拿数据与 meta.total，故不解包
  getArticlesPaged: async (params: Record<string, any> = {}) => {
    const res = await http.get('/public/articles', { params });
    return res.data as ApiResult<ArticleSummary[]> | any;
  },
  getArticle: (slug: string) => unwrap<ArticleDetail | null>(http.get(`/public/articles/${slug}`)),
  // 浏览计数显式上报：命中判重时 counted=false，前端不据此改动展示
  reportArticleView: (slug: string) =>
    unwrap<{ counted: boolean; reason?: 'not_found' | 'offline' | 'duplicate'; view_count?: number }>(
      http.post(`/public/articles/${slug}/view`)),
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
    // 新建一级页：后端在同一事务里创建页面记录与顶部 tab 行，返回实际落库的地址
    create: (body: { slug: string; title: string; contentJson?: any }) =>
      unwrap<{ id: number; slug: string; tabUrl: string }>(http.post('/pages', body)),
    updateMeta: (id: number, body: { title?: string; metaTitle?: string; metaDescription?: string; heroImage?: string }) =>
      unwrap(http.patch(`/pages/${id}`, body)),
    saveDraft: (id: number, contentJson: any) => unwrap(http.put(`/pages/${id}/draft`, { contentJson })),
    // 放弃草稿：清空 draft_json，编辑器回落线上版本
    discardDraft: (id: number) => unwrap(http.delete(`/pages/${id}/draft`)),
    publish: (id: number) => unwrap(http.post(`/pages/${id}/publish`)),
    unpublish: (id: number) => unwrap(http.post(`/pages/${id}/unpublish`)),
    remove: (id: number) => unwrap(http.delete(`/pages/${id}`)),
    // 跨页复制区块（decoration-editor-toolkit）：服务端单事务行锁追加副本到目标页草稿
    copyBlock: (targetSlug: string, body: { sourcePageId: number; blockIndex: number; targetIndex?: number }) =>
      unwrap<BlockCopyResult>(http.post(`/pages/${targetSlug}/blocks/copy`, body)),
  },
  // 区块模板库（decoration-editor-toolkit）：存为模板 / 从模板插入 / 改名 / 删除
  blockTemplates: {
    list: (params: Record<string, any> = {}) =>
      unwrapPaged<BlockTemplate[]>(http.get('/block-templates', { params })),
    create: (body: { name: string; type: string; props: Record<string, any> }) =>
      unwrap<{ id: number }>(http.post('/block-templates', body)),
    update: (id: number, body: { name?: string; type?: string; props?: Record<string, any> }) =>
      unwrap(http.patch(`/block-templates/${id}`, body)),
    remove: (id: number) => unwrap(http.delete(`/block-templates/${id}`)),
  },
  // 产品：一条内容同一时刻只存在于一张表，方法按「行在哪张表」分组，id 不跨组混用
  //   products.*      → 上架表的行 id。在架内容只读，内容动作只有下架；
  //                     唯一的写路径是 setOnlineSort（只改列表排序值，不碰内容列）。
  //                     后端的 DELETE /products/:id 是运维兜底端点，刻意不包成前端方法
  //   productDrafts.* → 未上架表的行 id（草稿与已下架同表）。编辑、发布、删除都从这里发起
  // 六个写方法都必带 uid（跨表稳定的内容身份标识），服务端断言行 id 与 uid 指向同一行；
  // 旧签名（create / update / 按上架 id 的 remove、提交 status 的路径）已移除，不留别名
  products: {
    list: (params: Record<string, any> = {}) => unwrapPaged<ProductAdminRow[]>(http.get('/products', { params })),
    getOnline: (id: number) => unwrap<ProductEditable>(http.get(`/products/${id}`)),
    // 调整在架产品的列表排序值：不需要先下架，也不产生内容改动
    setOnlineSort: (id: number, uid: string, sort: number) =>
      unwrap<{ id: number; uid: string; sort: number }>(http.post(`/products/${id}/sort`, { uid, sort })),
    // 下架 = 整行搬进未上架表并置 state=2：响应回传搬运后的行 id，界面据此进编辑页
    unpublish: (id: number, uid: string) =>
      unwrap<ProductUnpublishResult>(http.post(`/products/${id}/unpublish`, { uid })),
  },
  productDrafts: {
    get: (draftId: number) => unwrap<ProductEditable>(http.get(`/products/drafts/${draftId}`)),
    create: (body: ProductDraftPayload) =>
      unwrap<{ id: number; uid: string; slug: string; stripped_images: number }>(http.post('/products/drafts', body)),
    update: (draftId: number, uid: string, body: ProductDraftPayload) =>
      unwrap<{ stripped_images: number }>(http.patch(`/products/drafts/${draftId}`, { ...body, uid })),
    publish: (draftId: number, uid: string) =>
      unwrap<ProductPublishResult>(http.post(`/products/drafts/${draftId}/publish`, { uid })),
    // 删除只作用于未上架侧：草稿与已下架的行都能删，删不到任何在架内容
    remove: (draftId: number, uid: string) =>
      unwrap(http.delete(`/products/drafts/${draftId}`, { params: { uid } })),
  },
  productCategories: {
    list: () => unwrap<ProductCategoryAdminRow[]>(http.get('/product-categories')),
    create: (body: Record<string, any>) => unwrap<{ id: number; slug: string }>(http.post('/product-categories', body)),
    update: (id: number, body: Record<string, any>) => unwrap(http.patch(`/product-categories/${id}`, body)),
    // 删除保护按两表并集计数：ref_count 非 0 时后端回 409 + 「已上架 X 个、未上架 Y 个」
    remove: (id: number) => unwrap(http.delete(`/product-categories/${id}`)),
  },
  // 资讯：一条内容同一时刻只存在于一张表，方法按「行在哪张表」分组，id 不跨组混用
  //   articles.*      → 发布表的行 id。线上只读，唯一动作是下线，故这里没有写内容的方法；
  //                     后端的 DELETE /articles/:id 是运维兜底端点，刻意不包成前端方法
  //   articleDrafts.* → 未发布表的行 id。编辑、发布、删除都从这里发起
  // 三个写方法都必带 uid（跨表稳定的内容身份标识），服务端校验行 id 与 uid 指向同一行；
  // 旧签名（ensureRevision、按发布 id 的 remove、不带 uid 的 update/publish/remove）已移除，不留别名
  articles: {
    list: (params: Record<string, any> = {}) => unwrapPaged<ArticleAdminRow[]>(http.get('/articles', { params })),
    get: (id: number) => unwrap<ArticleEditable>(http.get(`/articles/${id}`)),
    // 下线 = 整行搬进未发布表并置 state=2：响应回传搬运后的行 id，界面据此进编辑页
    unpublish: (id: number) =>
      unwrap<{ draft_id: number; uid: string; view_count: number }>(http.post(`/articles/${id}/unpublish`)),
  },
  articleDrafts: {
    get: (draftId: number) => unwrap<ArticleEditable>(http.get(`/articles/drafts/${draftId}`)),
    create: (body: ArticleDraftPayload) =>
      unwrap<{ id: number; uid: string; slug: string; stripped_images: number }>(http.post('/articles/drafts', body)),
    update: (draftId: number, uid: string, body: ArticleDraftPayload) =>
      unwrap<{ stripped_images: number }>(http.patch(`/articles/drafts/${draftId}`, { ...body, uid })),
    publish: (draftId: number, uid: string) =>
      unwrap<{
        id: number; uid: string; published_at: string; view_count: number;
        first_published: boolean; stripped_images: number;
      }>(http.post(`/articles/drafts/${draftId}/publish`, { uid })),
    // 删除只作用于未发布侧：草稿与已下线的行都能删，删不到任何线上内容
    remove: (draftId: number, uid: string) =>
      unwrap(http.delete(`/articles/drafts/${draftId}`, { params: { uid } })),
  },
  articleCategories: {
    list: () => unwrap<ArticleCategoryAdminRow[]>(http.get('/article-categories')),
    create: (body: Record<string, any>) => unwrap<{ id: number; slug: string }>(http.post('/article-categories', body)),
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
    /**
     * 上传官网 Logo：后端以固定命名 brand/logo.<ext> 覆盖写入，并把带版本号的 URL 直接写回
     * logo_url 设置，因此无需再调 update 保存
     */
    uploadLogo: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return unwrap<{ url: string; objectKey: string }>(http.post('/upload/logo', fd));
    },
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
    // 一条资讯的完整改动时间线：entity_id 存的是 uid，所以两次换表（下线、再发布）仍落在同一查询里
    byArticleUid: (uid: string, params: Record<string, any> = {}) =>
      unwrapPaged<AuditRow[]>(http.get('/audit', { params: { ...params, entityType: 'article', entityUid: uid } })),
    // 产品同理：建 → 改 → 发布 → 排序 → 下架 → 改 → 再上架 都按同一个 uid 串起来
    byProductUid: (uid: string, params: Record<string, any> = {}) =>
      unwrapPaged<AuditRow[]>(http.get('/audit', { params: { ...params, entityType: 'product', entityUid: uid } })),
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
