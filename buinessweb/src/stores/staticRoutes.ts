/**
 * 前端路由扩展配置聚合出口
 *
 * 作用：
 *   将前端开发人员手动配置的字段（cached、activeMenu、filePath 等）按 url 一级级
 *   合并到后端返回的菜单树中（见 stores/userInfo.ts 的 mergeMenuTree）。
 *
 * 使用方式：
 *   1. 在 src/routes/ 目录下新建业务模块文件（如 feiyong.ts），导出一个 MenuItem[]
 *   2. 在下方引入并展开到 dynamicMenuTree 数组中
 *
 * 样例：
 *   src/routes/sample.ts 演示了全部配置特性（缓存、侧边栏高亮、动态路由等），
 *   可删可不删；默认启用，不用时注释掉下方两行即可。
 */
import type { MenuItem } from '@/types/global';

/* ==================== 样例配置（可删可不删） ==================== */
import { sampleRoutes } from '@/stores/routes/sample'; // ← 不用时：注释此行
/* ================================================================ */

export const dynamicMenuTree: MenuItem[] = [
  ...sampleRoutes // ← 同步注释此行
];
