/**
 * 官网一级页面地址口径（A 方案 `/:slug` 软通配）
 *
 * 与 backend/src/routes/content.ts 的 FIXED_PAGE_SLUGS / RESERVED_PAGE_SLUGS / PAGE_SLUG_RE 同步，
 * 改动必须两端一起改。固定一级页的路由由代码注册，因此「不可删除」由这份集合派生，
 * 不在数据库另存一份 is_fixed 标记——那会制造第二份真相，还会让代码依赖迁移是否已执行。
 */
export const FIXED_PAGE_SLUGS = ['home', 'about', 'products', 'news', 'contact'] as const;

/** 保留字：固定页 + 二级详情前缀 + 辅助/门控/管理段 + 历史死链 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  ...FIXED_PAGE_SLUGS,
  'product', 'article', 'search', 'login', 'preview', 'admin', 'option', 'p', '404',
]);

export const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 新增一级页的站内地址；home 由根路径承载，新增页恒为 `/{slug}` */
export function pagePath(slug: string): string {
  return slug === 'home' ? '/' : `/${slug}`;
}

/** 固定一级页由代码维护，页面记录与对应导航行都不可删除 */
export function isFixedPage(slug: string): boolean {
  return (FIXED_PAGE_SLUGS as readonly string[]).includes(slug);
}

/**
 * 把运营手工输入/粘贴的页面标识整理成合法 slug。
 *
 * 常见脏输入：复制地址时带上开头的 `/`、从网页/文档复制带进零宽与方向控制字符
 * （U+200B~200F、U+202A~202E、U+2060~2064、FEFF、不换行空格）、大写字母、
 * 空格/下划线/点/反斜杠、连续或首尾中划线。
 * 校验与实际提交必须使用本函数的输出，避免「肉眼看着没问题却报格式错」。
 * 与 backend/src/routes/content.ts 的 normalizePageSlug 同口径，改动须两端同步。
 */
export function normalizePageSlug(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00A0]/g, '') // 零宽 / 不可见 / 方向控制字符
    .trim()
    .replace(/^\/+/, '')                     // 允许直接粘贴 /xxx、//xxx
    .toLowerCase()
    .replace(/[\s_./\\]+/g, '-')             // 空格、下划线、点、反斜杠 → 中划线
    .replace(/-+/g, '-')                     // 合并连续中划线
    .replace(/^-+|-+$/g, '');               // 去掉首尾中划线
}

/** 新建页面表单的前端预校验，返回中文错误文案，空串表示通过；服务端会按同一口径再校验一次 */
export function validatePageSlug(raw: string): string {
  const slug = normalizePageSlug(raw);
  if (!slug) return '请填写页面标识（如 companys，只需小写字母、数字与中划线）';
  if (!PAGE_SLUG_RE.test(slug)) {
    return '页面标识只能含小写字母、数字与中划线：请去掉中文、标点或特殊符号（复制粘贴可能带入不可见字符）';
  }
  if (RESERVED_PAGE_SLUGS.has(slug)) return `「${slug}」是系统保留地址，请换一个`;
  return '';
}
