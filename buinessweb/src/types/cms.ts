// 与后端 /api 返回结构对齐的类型定义

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
  // meta 除分页三要素外，还可携带列表筛选项（如 media 的 categories）
  meta?: { page: number; pageSize: number; total: number; [facet: string]: any };
}

export interface Paginated<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MenuItem {
  id: number;
  parent_id: number | null;
  title: string;
  url: string;
  target: string;
  sort: number;
  status: number;
  children?: MenuItem[];
}

export interface SiteSettings {
  general?: Record<string, string>;
  seo?: Record<string, string>;
  social?: Record<string, string>;
  contact?: Record<string, string>;
}

export interface SiteConfig {
  settings: SiteSettings;
  menus: MenuItem[];
}

export interface Banner {
  id: number;
  title: string | null;
  image_url: string;
  link_url: string | null;
  position: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parent_id: number | null;
  sort: number;
}

export interface ProductSummary {
  id: number;
  slug: string;
  name: string;
  series: string | null;
  cover_image: string | null;
  summary: string | null;
  price_text: string | null;
  category: string | null;
}

export interface ProductDetail extends ProductSummary {
  gallery: string[];
  description: string | null;
  specs: { label: string; value: string }[];
  highlights: string[];
  buy_link: string | null;
  status: number;
  related: ProductSummary[];
}

export interface ArticleCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  cover_image: string | null;
  summary: string | null;
  tags: string[];
  author: string | null;
  published_at: string;
  category: string | null;
}

export interface ArticleDetail extends ArticleSummary {
  body: string;
  view_count: number;
  related: ArticleSummary[];
}

export interface Page {
  id: number;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  hero_image: string | null;
  status: number;
  published_at: string | null;
  content_json: any;
  /** 管理端草稿内容（仅 /pages 与 /pages/by-slug 管理接口返回） */
  draft_json?: any;
  /** 是否存在未发布的草稿改动（列表接口计算字段） */
  has_unpublished_draft?: boolean;
  updated_at?: string;
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
  sort?: number;
  status?: number;
}

// ---------------- 管理端行类型（与数据库 snake_case 返回对齐） ----------------

/** 页面列表行（GET /pages 精简列） */
export interface PageListRow {
  id: number;
  slug: string;
  title: string;
  status: number;
  published_at: string | null;
  has_unpublished_draft: boolean;
  updated_at: string;
}

/** 管理端产品行（GET /products、GET /products/:id） */
export interface ProductAdminRow {
  id: number;
  slug: string;
  name: string;
  series: string | null;
  category_id: number | null;
  cover_image: string | null;
  gallery?: string[];
  summary?: string | null;
  description?: string | null;
  specs?: any;
  highlights?: string[];
  price_text?: string | null;
  buy_link?: string | null;
  status: number;
  sort?: number;
  created_at?: string;
}

/** 管理端资讯行（GET /articles、GET /articles/:id） */
export interface ArticleAdminRow {
  id: number;
  slug: string;
  title: string;
  cover_image: string | null;
  category_id: number | null;
  summary?: string | null;
  body?: string;
  tags?: string[];
  author?: string | null;
  status: number;
  published_at: string | null;
  view_count?: number;
  created_at?: string;
}

/** Banner 管理行（GET /banners 全列） */
export interface BannerAdminRow {
  id: number;
  title: string | null;
  image_url: string;
  link_url: string | null;
  position: string;
  sort: number;
  status: number;
  start_at?: string | null;
  end_at?: string | null;
}

/** 媒体库条目（GET /media） */
export interface MediaItem {
  id: number;
  filename: string;
  original_name: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  url: string;
  object_key: string;
  category: string;
  created_at: string;
}

/** 线索行（GET /leads/:kind，字段随类型不同，宽松结构） */
export interface LeadRow {
  id: number;
  status: number;
  note: string | null;
  handled_by: string | null;
  ip: string | null;
  created_at: string;
  [key: string]: any;
}

/** 后台用户行（GET /users） */
export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  role_id: number;
  role_name: string;
  status: number;
  last_login_at: string | null;
  created_at: string;
}

/** 角色（GET /roles） */
export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

/** 审计日志行（GET /audit） */
export interface AuditRow {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  ip: string | null;
  created_at: string;
}

/** 站点设置：group → key → { value, label }（GET /settings） */
export type SettingsGrouped = Record<string, Record<string, { value: string; label: string | null }>>;

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  roleId: number;
  roleCode: string;
  permissions: string[];
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface InquiryPayload {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  needType?: string;
  productId?: number;
  message?: string;
}

export interface CooperationPayload {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  coopType?: string;
  message?: string;
}

export interface SubscriptionPayload {
  email: string;
  type?: string;
}

export interface ContactPayload {
  name: string;
  phone?: string;
  email?: string;
  type?: string;
  message: string;
}
