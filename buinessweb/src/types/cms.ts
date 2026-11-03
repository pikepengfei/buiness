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
  /** 导航链接；页脚顶级分组为列标题，可为空 */
  url: string | null;
  target: string;
  /** 导航位：header=顶栏 footer=页脚分组 cta=右上角按钮 */
  location: string;
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
  /** 顶栏主导航（location=header，children 为下拉子项） */
  menus: MenuItem[];
  /** 页脚分组列（location=footer，顶级项 url 为空表示列标题） */
  footerMenus: MenuItem[];
  /** 顶栏右上角按钮（location=cta） */
  ctaMenu: MenuItem | null;
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

/** 产品列表项形状：公开列表、公开详情里的 related、全站搜索三处同形 */
export interface ProductSummary {
  id: number;
  slug: string;
  name: string;
  series: string | null;
  cover_image: string | null;
  summary: string | null;
  price_text: string | null;
  /** 分类名称，跨表按 category_id 取；未分类为 null（界面不渲染分类标签，不回落写死文案） */
  category: string | null;
}

/**
 * 官网产品详情（GET /public/products/:slug）：只可能是在架内容，
 * 后端显式列下发列，运营侧字段（created_by / updated_by / sort / status）不出网，故这里没有它们。
 */
export interface ProductDetail extends ProductSummary {
  gallery: string[];
  description: string | null;
  specs: { label: string; value: string }[];
  highlights: string[];
  buy_link: string | null;
  published_at: string | null;
  updated_at: string | null;
  related: ProductSummary[];
}

export interface ArticleCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort: number;
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
  /** 区块结构版本（落地建议 P3；配合迁移 005 的 pages.schema_version 列） */
  schema_version?: number;
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
  /** 区块结构版本（落地建议 P3） */
  schema_version?: number;
  updated_at: string;
}

/**
 * 内容所在表：online = 上架表（在架，只读）、draft = 未上架表（草稿或已下架，可编辑可删除）。
 * 与资讯链同形但各自命名：两条链的称谓与状态语义不跨域共用一个别名。
 */
export type ProductOrigin = 'online' | 'draft';

/** 三态：由「在哪张表 + product_drafts.state」单点判出，服务端给中文文案（草稿 / 已上架 / 已下架） */
export type ProductState = 'draft' | 'published' | 'offline';

/**
 * 管理端产品列表行（GET /products）：两张表的并集，一条产品恰好一行。
 * id 只在它所在的那一侧有意义，跨表稳定身份是 uid——写请求与审计都按 uid 判定。
 * 列表只给编排所需的轻字段，正文级的 gallery/specs/highlights/description 走取数端点。
 */
export interface ProductAdminRow {
  id: number;
  origin: ProductOrigin;
  uid: string;
  slug: string;
  name: string;
  series: string | null;
  category_id: number | null;
  category: string | null;
  cover_image: string | null;
  price_text: string | null;
  sort: number;
  state: ProductState;
  state_text: string;
  published_at: string | null;
  /** 最后修改人：存量回填自 created_by，取不到时为 null（界面显示占位符，不猜人） */
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
  created_at: string;
}

/**
 * 产品编辑页取数（GET /products/:id 与 GET /products/drafts/:draftId）：一次只读一张表的一行。
 * 读线上行时 readonly=true 且带 readonly_hint，界面据此不给保存出口，只给「下架」与「调整排序」。
 */
export interface ProductEditable {
  id: number;
  origin: ProductOrigin;
  uid: string;
  slug: string;
  name: string;
  category_id: number | null;
  /** 分类名称，未分类为 null */
  category: string | null;
  series: string | null;
  cover_image: string | null;
  gallery: string[];
  summary: string | null;
  description: string | null;
  specs: { label: string; value: string }[];
  highlights: string[];
  price_text: string | null;
  buy_link: string | null;
  sort: number;
  state: ProductState;
  state_text: string;
  published_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  readonly?: boolean;
  readonly_hint?: string;
}

/**
 * 未上架侧写入体：字段名与后端 productDraftCreateSchema 对齐（camelCase）。
 * 没有 status，也没有 uid——状态只能由发布/下架动作产生，uid 由调用方作为独立参数传入并被服务端断言。
 * 也没有 slug——标识由服务端在创建时生成并写入，此后冻结，提交的那份被服务端丢弃。
 * categoryId 传 null 表示清除分类；不传（undefined）表示不改。
 */
export interface ProductDraftPayload {
  name?: string;
  categoryId?: number | null;
  series?: string | null;
  coverImage?: string | null;
  gallery?: string[];
  summary?: string | null;
  description?: string | null;
  specs?: { label: string; value: string }[];
  highlights?: string[];
  priceText?: string | null;
  buyLink?: string | null;
  sort?: number;
}

/** 产品上架时的响应（POST /products/drafts/:draftId/publish） */
export interface ProductPublishResult {
  id: number;
  uid: string;
  published_at: string;
  sort: number;
  /** true = 这条内容第一次进入上架表；再上架保留原有上架时间，故为 false */
  first_published: boolean;
}

/** 产品下架后的响应（POST /products/:id/unpublish）：搬运产生的新行 id，界面据此进编辑页 */
export interface ProductUnpublishResult {
  draft_id: number;
  uid: string;
  published_at: string | null;
}

/** 产品分类管理行（GET /product-categories 全列） */
export interface ProductCategoryAdminRow extends ProductCategory {
  /** 该分类下的产品数，跨上架表与未上架表统计，与删除前置检查同一来源 */
  ref_count?: number;
}

/** 内容所在表：online = 发布表（已上线，只读）、draft = 未发布表（草稿或已下线，可编辑可删除） */
export type ArticleOrigin = 'online' | 'draft';

/** 三态：由「在哪张表 + article_drafts.state」单点判出，服务端给中文文案，前端不再各自维护称谓 */
export type ArticleState = 'draft' | 'published' | 'offline';

/**
 * 管理端资讯行（GET /articles）：两张表的并集，一条条目恰好一行。
 * id 只在它所在的那一侧有意义，跨表稳定身份是 uid——写请求与审计都按 uid 判定。
 */
export interface ArticleAdminRow {
  id: number;
  origin: ArticleOrigin;
  uid: string;
  slug: string;
  title: string;
  cover_image: string | null;
  category_id: number | null;
  category: string | null;
  state: ArticleState;
  state_text: string;
  view_count: number;
  published_at: string | null;
  /** 最后修改人：不是创建人。存量回填自 created_by，取不到时为 null（界面显示占位符，不猜人） */
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

/**
 * 资讯编辑页取数：一次只读一张表的一行，不再有「读哪一份」的分支。
 * 读线上行时 readonly 为 true，界面据此不给保存出口，只提供下线。
 */
export interface ArticleEditable {
  id: number;
  origin: ArticleOrigin;
  uid: string;
  slug: string;
  title: string;
  cover_image: string | null;
  summary: string | null;
  body: string | null;
  category_id: number | null;
  category: string | null;
  tags: string[];
  author: string | null;
  state: ArticleState;
  state_text: string;
  published_at: string | null;
  view_count: number;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at?: string;
  updated_at?: string;
  readonly?: boolean;
  readonly_hint?: string;
}

/**
 * 草稿写入体：字段名与后端 draftCreateSchema 对齐（camelCase）。
 * 没有 status——上线只能由发布动作产生，草稿侧不接受状态参数。
 * 也没有 slug——标识由服务端在创建时生成并写入，此后冻结，提交的那份被服务端丢弃。
 */
export interface ArticleDraftPayload {
  title?: string;
  coverImage?: string | null;
  summary?: string | null;
  body?: string;
  categoryId?: number | null;
  tags?: string[];
  author?: string | null;
}

/** 资讯分类管理行（GET /article-categories 全列） */
export interface ArticleCategoryAdminRow extends ArticleCategory {
  /** 该分类下的资讯数，跨发布表与草稿表统计，删除前置检查用 */
  ref_count?: number;
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
  /** 询价记下的是内容身份 uid：产品在两表之间搬运（下架、再上架）后仍指同一条内容 */
  product_uid?: string | null;
  /** 按 uid 跨两表回查到的当前指向；未关联产品或产品已被彻底删除时为 null */
  product?: LeadProductRef | null;
  [key: string]: any;
}

/** 线索关联的产品指向：三态文案由服务端单点给出，前端不再据 id 猜状态 */
export interface LeadProductRef {
  name: string;
  slug: string;
  origin: ProductOrigin;
  state_text: string;
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

/** 改动留痕：正文只记长度与摘要，不整份存正文（首个启用 diff 的实体是资讯） */
export interface AuditDiff {
  fields: string[];
  from: Record<string, unknown>;
  to: Record<string, unknown>;
}

/** 审计日志行（GET /audit） */
export interface AuditRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity_type: string;
  /** 资讯侧写的是内容身份标识 uid（不是行主键），跨两次换表也能串出完整时间线 */
  entity_id: string;
  diff: AuditDiff | null;
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
