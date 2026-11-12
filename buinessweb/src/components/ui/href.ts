/**
 * 基础元素的跳转地址口径（白名单式判定）
 *
 * 允许：站内绝对路径 / 页内锚点 / mailto: / tel:
 * 拒绝：协议相对地址（//host）、http(s) 等站外绝对地址、javascript: 等危险协议、
 *       以及不以 / 开头的相对路径（易随页面位置漂移）
 */
export type HrefMode = 'none' | 'router' | 'anchor' | 'raw' | 'invalid';

export interface ResolvedHref {
  mode: HrefMode;
  href: string;
}

/** 编辑态提示文案：非法地址时原样透出允许形式 */
export const HREF_RULE_TIP = '跳转地址仅支持站内路径（如 /products）、页内锚点（如 #story）、mailto: 或 tel:';

const SAFE_SCHEMES = ['mailto', 'tel'];

export function resolveHref(raw?: string | null): ResolvedHref {
  const value = (raw ?? '').trim();
  if (!value) return { mode: 'none', href: '' };
  if (value.startsWith('#')) return { mode: 'anchor', href: value };
  // //host 形式的协议相对地址会被浏览器按当前协议解析到站外，必须拒绝
  if (value.startsWith('///') || value.startsWith('//')) return { mode: 'invalid', href: value };
  if (value.startsWith('/')) return { mode: 'router', href: value };

  const scheme = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme && SAFE_SCHEMES.includes(scheme[1].toLowerCase())) return { mode: 'raw', href: value };
  return { mode: 'invalid', href: value };
}
