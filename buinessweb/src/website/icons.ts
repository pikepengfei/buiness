/**
 * 官网区块内置图标（Lucide 风格 stroke 路径，24x24 viewBox）
 * 区块 props 中的 icon 字段存图标 key，组件按 key 渲染，保证风格统一且不可注入
 */
export const SECTION_ICONS: Record<string, string[]> = {
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
  shield: ['M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z', 'M9 12l2 2 4-4'],
  bulb: ['M9 18h6M10 22h4M12 2a7 7 0 0 1 4.9 11.9c-.9.9-1.4 1.9-1.6 3.1h-6.6c-.2-1.2-.7-2.2-1.6-3.1A7 7 0 0 1 12 2z'],
  harmony: ['M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M16 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M12 12l4-4M12 12l4 4'],
  phone: ['M7 2h10a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z', 'M11 18h2'],
  memory: ['M2 7h20v10H2z M6 11v2M10 11v2M14 11v2M18 11v2'],
  monitor: ['M3 4h18v13H3z M8 21h8M12 17v4M7 9h10M7 12h7'],
  check: ['M20 6L9 17l-5-5'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 3'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
};

export const SECTION_ICON_KEYS = Object.keys(SECTION_ICONS);
