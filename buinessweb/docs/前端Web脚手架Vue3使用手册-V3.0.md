# 前端 Web 脚手架 Vue3 使用手册 V3.0

> Vue3 前端脚手架模板（vue3-template）
>
> 最后更新：2026-06-16

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈](#2-技术栈)
- [3. 目录结构](#3-目录结构)
- [4. 本地开发](#4-本地开发)
- [5. Trae IDE 规则体系](#5-trae-ide-规则体系)
- [6. Trae IDE Skills 体系](#6-trae-ide-skills-体系)
- [7. 核心开发规范](#7-核心开发规范)
- [8. 公共组件与样式](#8-公共组件与样式)
- [9. 路由系统](#9-路由系统)
- [10. 状态管理](#10-状态管理)
- [11. API 层与 HTTP 封装](#11-api-层与-http-封装)
- [12. 环境变量](#12-环境变量)
- [13. 代码质量保障](#13-代码质量保障)
- [14. 问题排查](#14-问题排查)
- [附录 A：更新日志](#附录-a更新日志)

---

## 1. 项目概览

Vue3 前端脚手架模板是一套基于 Vue 3 的企业级中后台管理系统基础脚手架，提供开箱即用的核心能力：

| 能力      | 说明                                                  |
| --------- | ----------------------------------------------------- |
| 动态路由  | 根据后端菜单树自动生成路由，支持五级菜单嵌套          |
| 权限控制  | 按钮级权限控制，基于后端返回的 buttonList             |
| 布局系统  | 顶部导航 + 侧边菜单 + 标签页 + 面包屑，支持菜单收藏   |
| HTTP 封装 | Axios 统一封装，请求/响应拦截器，401 自动跳转认证中心 |
| 页面缓存  | 基于 keep-alive 的一级/二级路由缓存管理               |
| 水印功能  | 基于 watermark-js-plus 的页面水印                     |
| 统一认证  | 对接 IDaaS 统一认证中心，支持 SSO 单点登录            |

### 演示菜单结构

项目内置模拟菜单数据（`src/stores/menuData.ts`），包含以下演示模块：

| 一级菜单    | 包含功能                             |
| ----------- | ------------------------------------ |
| 一级菜单1   | 多级嵌套菜单、动态参数路由、外链菜单 |
| 一级菜单2   | 五级菜单嵌套、四级/五级菜单展示      |
| 一级菜单3   | 二级菜单                             |
| 一级菜单444 | 二级 + 三级菜单                      |
| 一级菜单5   | 外链菜单（跳转外部网站）             |
| 一级菜单6   | 动态参数路由（`/yingxiao/:id`）      |

> **注意**：`menuData.ts` 仅用于演示，真实开发中应删除，使用后端接口获取菜单数据。

---

## 2. 技术栈

### 核心框架

| 技术         | 版本    | 说明                         |
| ------------ | ------- | ---------------------------- |
| Vue          | ^3.5.32 | 渐进式前端框架               |
| TypeScript   | ~5.8.3  | 类型安全                     |
| Vite         | ^6.0.7  | 构建工具                     |
| Pinia        | ^3.0.4  | 状态管理（Setup Store 风格） |
| Vue Router   | ^5.0.4  | 路由管理                     |
| Element Plus | ^2.13.7 | UI 组件库                    |

### 工具链

| 技术        | 版本     | 说明           |
| ----------- | -------- | -------------- |
| ESLint      | ^10.2.1  | 代码检查       |
| Prettier    | ^3.8.3   | 代码格式化     |
| Husky       | ^9.1.7   | Git Hooks      |
| lint-staged | ^16.4.0  | 暂存区代码检查 |
| Vitest      | ^4.1.4   | 单元测试       |
| Cypress     | ^15.14.0 | E2E 测试       |

### 关键依赖

| 依赖              | 版本    | 说明      |
| ----------------- | ------- | --------- |
| axios             | ^1.15.1 | HTTP 请求 |
| echarts           | ^6.0.0  | 图表库    |
| lodash-es         | ^4.18.1 | 工具函数  |
| watermark-js-plus | ^1.6.3  | 水印      |
| animate.css       | ^4.1.1  | 动画库    |

### Vite 插件

| 插件                     | 说明                             |
| ------------------------ | -------------------------------- |
| unplugin-auto-import     | 自动导入 API（ref、computed 等） |
| unplugin-vue-components  | 组件自动按需导入（Element Plus） |
| unplugin-element-plus    | Element Plus 样式按需导入        |
| vite-plugin-vue-devtools | Vue 开发者工具                   |

### 运行环境

| 要求     | 版本                               |
| -------- | ---------------------------------- |
| Node.js  | ^18.0.0 \|\| ^20.0.0 \|\| >=22.0.0 |
| 包管理器 | pnpm（指定 pnpm@9.0.6）            |

---

## 3. 目录结构

### 3.1 项目根目录

```
vue3-template/
├── .husky/                     # Git Hooks 配置
│   └── pre-commit              # 提交前自动 lint-staged
├── .trae/                      # Trae IDE 配置（规则 + 技能）
│   ├── rules/                  # 开发规范规则（19个）
│   ├── skills/                 # 开发技能（8个）
│   └── specs/                  # 功能规格文档
├── AutoCFG/                    # Nginx 配置
│   └── default.conf
├── cypress/                    # E2E 测试
│   ├── e2e/                    # 测试用例
│   ├── fixtures/               # 测试数据
│   └── support/                # 测试辅助
├── docs/                       # 项目文档
│   └── 前端Web脚手架Vue3使用手册-V3.0.md
├── public/                     # 静态资源（不经过构建）
│   └── favicon.ico
├── src/                        # 源代码（详见 3.2）
├── .env.development            # 开发环境变量
├── .env.production             # 生产环境变量
├── .gitignore                  # Git 忽略规则
├── .prettierrc.json            # Prettier 配置
├── .prettierignore             # Prettier 忽略规则
├── auto-imports.d.ts           # 自动导入类型声明
├── components.d.ts             # 组件自动导入类型声明
├── cypress.config.ts           # Cypress 配置
├── env.d.ts                    # 环境类型声明
├── eslint.config.js            # ESLint 配置（Flat Config）
├── index.html                  # 入口 HTML
├── package.json                # 项目依赖与脚本
├── pnpm-lock.yaml              # 依赖锁文件（必须提交）
├── tsconfig.json               # TypeScript 配置入口
├── tsconfig.app.json           # 应用 TS 配置
├── tsconfig.node.json          # Node 端 TS 配置
├── tsconfig.vitest.json        # 测试 TS 配置
├── vite.config.ts              # Vite 构建配置
└── vitest.config.ts            # Vitest 测试配置
```

### 3.2 src/ 源代码目录

```
src/
├── api/                        # API 接口层
│   └── api.ts                  # 通用接口（getUserInfo、logout）
├── assets/                     # 静态资源
│   ├── img/                    # 图片资源
│   │   ├── Top_bg.jpg          # 首页背景
│   │   ├── background.png      # 通用背景
│   │   └── box_01~04.png       # 首页卡片图
│   └── style/                  # 样式文件
│       ├── main.css            # 主样式入口（导入 restcss.css）
│       ├── restcss.css         # CSS Reset + Element Plus 主题覆盖 + 业务变量
│       ├── font.css            # 字体样式
│       └── pingfangziti/       # 苹方字体文件
├── components/                 # 公共组件
│   └── empty/                  # 空状态组件
│       └── index.vue
├── hooks/                      # Composables（Hooks）
│   └── waterMark.ts            # 水印 Hook（useWatermark）
├── router/                     # 路由配置
│   ├── index.ts                # 路由入口（静态路由 + beforeEach 守卫）
│   └── asyncRoutes.ts          # 动态路由生成（根据后端 menuTree）
├── stores/                     # Pinia Store（Setup Store 风格）
│   ├── userInfo.ts             # 用户信息 + 菜单树 + 按钮权限
│   ├── tagsView.ts             # 标签页管理
│   ├── keepAlive.ts            # 页面缓存管理
│   ├── menuData.ts             # 模拟菜单数据（演示用，真实开发需删除）
│   └── staticRoutes.ts         # 前端静态路由配置（cached、activeMenu 等）
├── types/                      # TypeScript 类型定义
│   └── global.ts               # 全局类型（MenuItem、ButtonInfo、UserInfoResponse 等）
├── utils/                      # 工具函数
│   ├── http.ts                 # Axios 封装（请求/响应拦截器）
│   └── index.ts                # 通用工具函数
├── views/                      # 页面视图（按一级菜单/二级菜单层级组织）
│   ├── home/                   # 首页
│   │   ├── index.vue
│   │   ├── svg-icon.vue        # SVG 图标组件
│   │   └── components/echarts/ # 首页图表
│   │       ├── echarts.vue
│   │       ├── chartConfigs.ts
│   │       └── config.ts
│   ├── layout/                 # 布局组件
│   │   ├── index.vue           # 主布局
│   │   └── components/         # 布局子组件
│   │       ├── header.vue      # 顶部导航栏
│   │       ├── header-right.vue # 右侧用户信息
│   │       ├── tags-view.vue   # 标签视图
│   │       ├── menuTree/       # 侧边菜单树
│   │       │   └── index.vue
│   │       ├── breadcrumb/     # 面包屑
│   │       │   └── index.vue
│   │       ├── zm-logo.vue     # Logo
│   │       └── useScrollTo.ts  # 平滑滚动 Hook
│   ├── feiyong/                # 一级菜单：费用（演示）
│   │   ├── feiyong11/          # 二级菜单
│   │   ├── duizhang12~16/      # 二级菜单（含动态参数路由）
│   │   └── two-one/            # 二级菜单
│   │       ├── organization/   # 三级菜单
│   │       ├── organization2/  # 三级菜单
│   │       ├── add/            # 三级菜单（hidden）
│   │       └── detail/         # 三级菜单（动态参数 :id，hidden）
│   ├── huoyuan/                # 一级菜单：货源（演示）
│   │   ├── duizhang12~16/      # 二级菜单
│   │   └── two-one/            # 二级菜单
│   │       └── lixiang/        # 三级菜单
│   │           ├── list/       # 四级菜单
│   │           ├── listDetail/ # 四级菜单（hidden）
│   │           ├── list3/      # 四级菜单
│   │           └── list4/      # 四级菜单
│   │               ├── child/  # 五级菜单
│   │               └── child2~4/ # 五级菜单
│   ├── caiwu/                  # 一级菜单：财务（演示）
│   │   ├── list1/
│   │   └── list2/
│   ├── tongji/                 # 一级菜单：统计（演示）
│   │   ├── tongji1/            # 二级菜单
│   │   │   ├── fenxi/          # 三级菜单
│   │   │   └── fenxi1/         # 三级菜单
│   │   ├── duizhang/           # 二级菜单
│   │   │   ├── fenbu/          # 三级菜单
│   │   │   └── qingdan/        # 三级菜单
│   │   └── duizhang11~16/      # 二级菜单
│   ├── yingxiao/               # 一级菜单：营销（动态参数 :id）
│   ├── kefu/                   # 一级菜单：客服
│   ├── about/                  # 测试页面
│   ├── http/                   # 测试页面
│   ├── test1/                  # 测试页面
│   ├── redirect/               # 页面刷新中间跳转
│   ├── Notfound.vue            # 404 页面
│   └── key.ts                  # 全局 Symbol 键（userNameKey）
├── App.vue                     # 根组件
├── main.ts                     # 应用入口
└── .d.ts                       # Vue 模块类型声明
```

### 3.3 .trae/ 配置目录

```
.trae/
├── rules/                              # 开发规范规则（19个）
│   ├── 00-项目概览与协作约定.md          # 项目概览、技术栈、目录结构、协作约定
│   ├── 01-1-Vue组件规范.md              # 组件结构、SFC顺序、defineOptions、生命周期
│   ├── 01-2-TypeScript规范.md           # 类型定义、interface vs type、泛型使用
│   ├── 01-3-样式规范.md                 # CSS变量、scoped样式、深度选择器、El-Table对齐
│   ├── 01-4-文件与目录命名.md           # 视图目录、组件目录、API/Type/Store/Hook 文件命名
│   ├── 01-5-代码命名.md                 # 组件名、Store名、函数名、变量名、常量名
│   ├── 01-6-路由规范.md                 # 路由URL驼峰命名、视图目录对应、name跳转
│   ├── 01-7-Hooks使用规范.md            # useWatermark等Composable使用模式
│   ├── 01-8-PiniaStore规范.md           # Setup Store风格、命名规范、状态管理
│   ├── 01-9-ElementPlus规范.md          # 组件按需导入、图标使用、表格、表单、消息提示
│   ├── 02-API接口规范.md                # API调用、类型定义、错误处理、分页查询
│   ├── 03-Git提交规范.md                # 分支命名、Conventional Commits、Scope列表
│   ├── 04-错误处理规范.md               # HTTP错误、API响应、业务错误、安全原则
│   ├── 05-测试规范.md                   # Vitest、@vue/test-utils、测试优先级
│   ├── 06-依赖管理规范.md               # pnpm安装、版本管理、依赖审查
│   ├── 07-环境变量规范.md               # VITE_前缀、敏感信息保护、环境区分
│   ├── 08-代码注释规范.md               # 注释风格、TODO/FIXME标记、何时写注释
│   ├── 09-安全编码规范.md               # XSS防护、密钥管理、认证检查、输入校验
│   ├── 99-问题排查checklist.md          # 白屏、报错、404、接口超时排查步骤
│   └── README.md                        # 规则体系说明文档
├── skills/                             # 开发技能（8个）
│   ├── feature/
│   │   ├── crud-list-page/             # CRUD 列表页开发引导器
│   │   │   ├── SKILL.md
│   │   │   └── assets/
│   │   │       └── crud-list-page-template.md
│   │   ├── crud-detail-page/           # 详情页开发引导器
│   │   │   └── SKILL.md
│   │   ├── feature-requirements-clarification/  # 需求澄清
│   │   ├── feature-tech-design/        # 技术设计
│   │   ├── feature-task-planning/      # 任务规划
│   │   ├── feature-implementation/     # 编码实现
│   │   └── feature-evolution/          # 功能迭代
│   ├── sync-api-docs/                  # API 文档同步
│   │   └── SKILL.md
│   └── README.md                       # Skills 使用指南
└── specs/                              # 功能规格文档
    └── PROJECT-CONTEXT.md              # 项目上下文
```

---

## 4. 本地开发

### 4.1 环境准备

```bash
# 确认 Node.js 版本
node -v  # 需要 ^18.0.0 || ^20.0.0 || >=22.0.0

# 安装 pnpm（如未安装）
npm install -g pnpm@9.0.6
```

### 4.2 常用命令

| 命令              | 说明                        |
| ----------------- | --------------------------- |
| `pnpm install`    | 安装依赖                    |
| `pnpm dev`        | 启动开发服务器（端口 5199） |
| `pnpm build`      | 构建生产版本（含类型检查）  |
| `pnpm build-only` | 仅构建（不做类型检查）      |
| `pnpm preview`    | 预览生产构建                |
| `pnpm lint`       | ESLint 检查并自动修复       |
| `pnpm format`     | Prettier 格式化 src/ 目录   |
| `pnpm type-check` | TypeScript 类型检查         |
| `pnpm test:unit`  | 运行单元测试                |
| `pnpm test:e2e`   | 运行 E2E 测试               |

### 4.3 开发服务器配置

Vite 开发服务器配置（`vite.config.ts`）：

```typescript
server: {
  port: 5199,
  host: true,  // 允许局域网访问
}
```

### 4.4 路径别名

```typescript
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url))
  }
}
```

使用 `@/` 前缀引用 src 目录下的模块，如 `import { useWatermark } from '@/hooks/waterMark'`。

---

## 5. Trae IDE 规则体系

### 5.1 规则配置总览

| 类型        | 数量      | 占比 | 说明                       |
| ----------- | --------- | ---- | -------------------------- |
| ✅ 全局生效 | 13 个     | 68%  | 核心开发规范，日常编码必备 |
| ⚠️ 按需请求 | 6 个      | 32%  | 特定场景触发，减少干扰     |
| **总计**    | **19 个** | 100% | 覆盖项目所有方面           |

### 5.2 全局生效规则（13个）

这些规则会在**每次打开文件时自动加载**，确保核心开发规范的执行。

#### 项目基础（2个）

| 规则文件                   | 适用场景 | 核心内容                              |
| -------------------------- | -------- | ------------------------------------- |
| `00-项目概览与协作约定.md` | 所有文件 | 技术栈、目录结构、开发命令、协作约定  |
| `09-安全编码规范.md`       | 所有文件 | XSS防护、密钥管理、认证检查、输入校验 |

#### Vue 开发核心（4个）

| 规则文件                  | 适用场景           | 核心内容                                             |
| ------------------------- | ------------------ | ---------------------------------------------------- |
| `01-1-Vue组件规范.md`     | `.vue` 文件        | 组件结构、SFC顺序、defineOptions、生命周期、状态分组 |
| `01-3-样式规范.md`        | `.vue`/`.css` 文件 | CSS变量、scoped样式、深度选择器、El-Table对齐        |
| `01-9-ElementPlus规范.md` | `.vue` 文件        | 组件按需导入、图标使用、表格、表单、消息提示         |
| `02-API接口规范.md`       | `.ts`/`.vue` 文件  | API调用、类型定义、错误处理、分页查询                |

#### TypeScript & 命名（4个）

| 规则文件                 | 适用场景          | 核心内容                                         |
| ------------------------ | ----------------- | ------------------------------------------------ |
| `01-2-TypeScript规范.md` | `.ts`/`.vue` 文件 | 类型定义、interface vs type、泛型使用、分页扩展  |
| `01-4-文件与目录命名.md` | 所有文件          | 视图目录、组件目录、API/Type/Store/Hook 文件命名 |
| `01-5-代码命名.md`       | `.ts`/`.vue` 文件 | 组件名、Store名、函数名、变量名、常量名、CSS变量 |
| `08-代码注释规范.md`     | `.ts`/`.vue` 文件 | 注释风格、TODO/FIXME标记、何时写/不写注释        |

#### 架构与工具（3个）

| 规则文件                | 适用场景                   | 核心内容                                      |
| ----------------------- | -------------------------- | --------------------------------------------- |
| `01-6-路由规范.md`      | `.vue`/`src/router/**`     | 路由URL驼峰命名、视图目录对应、name跳转       |
| `01-7-Hooks使用规范.md` | `src/hooks/**/*.ts`/`.vue` | useWatermark等Composable使用模式              |
| `04-错误处理规范.md`    | `.ts`/`src/**`             | HTTP错误、API响应校验、业务错误处理、安全原则 |

### 5.3 按需请求规则（6个）

这些规则**只在特定操作或特定文件类型时才加载**。

#### Git 操作相关（1个）

| 规则文件            | 触发时机        | 核心内容                                  |
| ------------------- | --------------- | ----------------------------------------- |
| `03-Git提交规范.md` | 执行 Git 操作时 | 分支命名、Conventional Commits、Scope列表 |

#### 特定文件类型（5个）

| 规则文件                  | 适用文件                         | 触发时机                    |
| ------------------------- | -------------------------------- | --------------------------- |
| `01-8-PiniaStore规范.md`  | `src/stores/**/*.ts`             | 编辑 Pinia Store 定义文件时 |
| `05-测试规范.md`          | `*.test.ts`、`*.spec.ts`         | 编写单元测试、组件测试时    |
| `06-依赖管理规范.md`      | `package.json`、`pnpm-lock.yaml` | 安装/更新依赖包时           |
| `07-环境变量规范.md`      | `.env*` 文件                     | 配置开发/生产环境变量时     |
| `99-问题排查checklist.md` | 所有文件（手动请求）             | 遇到白屏、报错、404等问题时 |

### 5.4 规则优先级

#### P0 - 阻断级（必须严格遵守）

违反会导致**代码无法运行**或**严重安全隐患**：

| 规则                     | 违规后果                    |
| ------------------------ | --------------------------- |
| `09-安全编码规范.md`     | XSS攻击、数据泄露、认证绕过 |
| `02-API接口规范.md`      | 接口调用失败、数据处理异常  |
| `01-2-TypeScript规范.md` | 类型错误、运行时崩溃        |
| `04-错误处理规范.md`     | 错误未捕获、用户体验差      |

#### P1 - 重要级（强烈建议遵守）

违反会影响**代码质量**和**维护性**：

| 规则                      | 违规后果                   |
| ------------------------- | -------------------------- |
| `01-1-Vue组件规范.md`     | 组件结构混乱、生命周期错误 |
| `01-9-ElementPlus规范.md` | UI不一致、性能问题         |
| `01-6-路由规范.md`        | 路由跳转失败、404错误      |

#### P2 - 改进级（建议遵守）

违反会影响**代码风格**和**团队协作**：

| 规则                     | 违规后果             |
| ------------------------ | -------------------- |
| `01-3-样式规范.md`       | 样式冲突、难以维护   |
| `01-4-文件与目录命名.md` | 文件组织混乱         |
| `01-5-代码命名.md`       | 可读性差、理解成本高 |
| `08-代码注释规范.md`     | 代码意图不明确       |

#### P3 - 规范级（参考遵循）

在**特定场景下**提供指导：

| 规则                      | 适用场景      |
| ------------------------- | ------------- |
| `03-Git提交规范.md`       | Git 操作时    |
| `01-8-PiniaStore规范.md`  | 开发 Store 时 |
| `05-测试规范.md`          | 编写测试时    |
| `06-依赖管理规范.md`      | 管理依赖时    |
| `07-环境变量规范.md`      | 配置环境时    |
| `99-问题排查checklist.md` | 排查问题时    |

---

## 6. Trae IDE Skills 体系

### 6.1 功能开发全流程

每个功能的开发遵循四个步骤，严格按顺序执行：

```
需求澄清 → 技术设计 → 任务规划 → 编码实现
```

### 6.2 Skills 列表

| Skill                                | 触发方式                           | 核心产出             |
| ------------------------------------ | ---------------------------------- | -------------------- |
| `feature-requirements-clarification` | "我想做一个 XX 功能"               | 需求文档（含 AC）    |
| `feature-tech-design`                | "开始技术设计"                     | 技术方案             |
| `feature-task-planning`              | "拆任务"                           | 任务规划             |
| `feature-implementation`             | "完成 XX 功能的第 N 阶段"          | 可运行代码 + 测试    |
| `feature-evolution`                  | "这个功能我想加一个 XX"            | 增量更新文档 + 任务  |
| `crud-list-page`                     | 技术方案标注 CRUD 列表页后自动触发 | 标准 CRUD 列表页代码 |
| `crud-detail-page`                   | "开发 XX 详情页"                   | 标准详情页代码       |
| `sync-api-docs`                      | "更新接口文档"                     | 同步 api.json        |

### 6.3 CRUD 列表页 Skill（核心 Skill）

六步生成标准 CRUD 列表页：

1. **创建类型定义** — `src/types/{module}/{feature}.ts`
2. **创建 API 层** — `src/api/{module}/{feature}.ts`
3. **创建常量文件** — `src/views/{module}/{feature}/constants.ts`
4. **创建列表页主组件** — `src/views/{module}/{feature}/index.vue`
5. **创建表单抽屉组件** — `src/views/{module}/{feature}/components/FormDrawer.vue`
6. **验证** — `pnpm lint` + `pnpm type-check`

### 6.4 详情页 Skill

基于标准详情页模式，生成详情页代码。

---

## 7. 核心开发规范

### 7.1 Vue 组件规范

#### 组件文件结构顺序

```vue
<script setup lang="ts">
// 1. defineOptions（组件 name）
defineOptions({ name: 'feiyong-two-one-organization' });

// 2. Vue 核心导入
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

// 3. 第三方库导入
import { ElMessage } from 'element-plus';
import { Search, RefreshLeft, Plus } from '@element-plus/icons-vue';

// 4. 类型导入（import type）
import type { SomeVO } from '@/types/module/feature';
import type { ButtonInfo } from '@/types/global';

// 5. 项目内部导入（按目录分组）
//    5.1 公共组件
//    5.2 API 接口
//    5.3 Hooks
//    5.4 页面级模块

// 6. Props 定义
const props = defineProps<{ visible: boolean }>();

// 7. Emits 定义
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'success'): void;
}>();

// 8. 路由/Store/Hooks 初始化
const route = useRoute();

// 9. 响应式状态（按功能分区）
// ==================== 按钮权限 ====================
const buttonList = (route.meta.buttonList as Array<ButtonInfo>) || [];

// ==================== 搜索状态 ====================
const searchForm = ref({ keyword: '', pageNum: 1, pageSize: 10 });

// ==================== 表格状态 ====================
const loading = ref(false);
const tableData = ref<SomeVO[]>([]);

// ==================== 抽屉/弹窗状态 ====================
const drawerVisible = ref(false);
const editingId = ref<number | null>(null);

// 10. 方法（按功能分组）
async function loadData() {
  /* ... */
}
function handleSearch() {
  /* ... */
}
function handleAdd() {
  /* ... */
}
function handleDrawerSuccess() {
  /* ... */
}

// 11. 生命周期（必须放在代码底部）
onMounted(async () => {
  loadData();
});
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped>
/* 样式内容 */
</style>
```

#### defineOptions 组件命名

使用 `-` 拼接各驼峰片段，对应路由路径的层级关系：

| 路由 URL                        | 组件 name                      |
| ------------------------------- | ------------------------------ |
| `/feiyong/two-one/organization` | `feiyong-two-one-organization` |
| `/huoyuan/two-one/lixiang/list` | `huoyuan-two-one-lixiang-list` |
| `/tongji/tongji1/fenxi`         | `tongji-tongji1-fenxi`         |
| `/caiwu/list1`                  | `caiwu-list1`                  |

#### 提交按钮 loading 防重复点击

**所有触发异步提交操作的按钮必须绑定 `:loading` 状态**：

```typescript
const submitLoading = ref(false);

async function handleSubmit() {
  submitLoading.value = true;
  try {
    const res = await createXxx(submitData);
    if (res.code === '200') {
      ElMessage.success({ message: '操作成功', duration: 2000 });
    } else {
      ElMessage.error({ message: res.msg ?? '操作失败', duration: 2000 });
      return;
    }
    emit('success');
  } catch {
    // 错误已在拦截器提示
  } finally {
    submitLoading.value = false;
  }
}
```

```html
<el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
```

### 7.2 TypeScript 规范

#### 核心原则

- **禁止使用 `any`**：使用 `unknown` + 类型守卫
- **禁止非空断言（!）**：使用默认值或可选链替代
- **使用 `import type` 导入纯类型**

#### 全局类型（禁止重复定义）

| 类型名             | 用途             | 所在文件              |
| ------------------ | ---------------- | --------------------- |
| `MenuItem`         | 菜单项类型       | `src/types/global.ts` |
| `ButtonInfo`       | 按钮权限项类型   | `src/types/global.ts` |
| `UserInfoResponse` | 用户信息接口返回 | `src/types/global.ts` |
| `TagView`          | 标签视图项类型   | `src/types/global.ts` |
| `TableRow`         | 表格行数据结构   | `src/types/global.ts` |
| `ECOption`         | ECharts 配置类型 | `src/types/global.ts` |

### 7.3 样式规范

#### CSS 变量系统

所有颜色、间距、圆角等必须使用 CSS 变量，禁止硬编码。项目 CSS 变量定义在 `src/assets/style/restcss.css` 中：

```css
:root {
  /* Element Plus 主色系覆盖 */
  --el-color-primary: #0083ff;
  --el-color-success: #33a647;
  --el-color-warning: #fda413;
  --el-color-danger: #cc0000;

  /* 业务自定义变量 */
  --zm-header-height: 78px;
  --zm-footer-height: 32px;
  --zm-tags-view-height: 45px;
  --zm-nav-opacity: 0.8;
}
```

使用方式：

```css
/* ✅ 正确 */
.title {
  color: var(--el-color-primary);
  height: var(--zm-header-height);
}

/* ❌ 错误 */
.title {
  color: #0083ff;
  height: 78px;
}
```

#### Element Plus 组件样式覆盖

- **优先通过 CSS 变量覆盖**，如 `--el-dialog-border-radius: 8px`
- **全局覆盖放在 `restcss.css` 中**，不要在组件内覆盖全局样式
- **组件级覆盖使用 `:deep()`** 穿透

#### El-Table 对齐规范

| 规则         | 说明                                                |
| ------------ | --------------------------------------------------- |
| 表头居中     | 所有 `el-table` 建议设置 `header-align="center"`    |
| 固定内容列   | 选择列、序号列、操作列、短数值列 → `align="center"` |
| 长文本列     | 名称、描述、摘要等 → 不设 `align`，保持默认左对齐   |
| selection 列 | 仅在有批量操作需求时添加                            |

### 7.4 路由规范

#### 核心规则

- **路由 URL 使用驼峰式（camelCase）**
- **视图目录与路由 path 一致**
- **组件 name 使用 `-` 拼接**
- **router.push() 必须使用 name 跳转，禁止使用 path**

```typescript
// ✅ 正确：使用 name 跳转
router.push({ name: 'feiyong-two-one-organization' });

// ❌ 错误：使用 path 跳转（权限不足时会 404）
router.push('/feiyong/two-one/organization');
```

#### 路由 URL → 视图目录 → 组件 name 映射

| 路由 URL                        | 视图目录                              | 组件 name                      |
| ------------------------------- | ------------------------------------- | ------------------------------ |
| `/feiyong/two-one/organization` | `views/feiyong/two-one/organization/` | `feiyong-two-one-organization` |
| `/huoyuan/two-one/lixiang/list` | `views/huoyuan/two-one/lixiang/list/` | `huoyuan-two-one-lixiang-list` |
| `/tongji/tongji1/fenxi`         | `views/tongji/tongji1/fenxi/`         | `tongji-tongji1-fenxi`         |
| `/caiwu/list1`                  | `views/caiwu/list1/`                  | `caiwu-list1`                  |

#### 动态路由参数

当路由包含动态参数时，必须在 `staticRoutes.ts` 中配置 `filePath` 和 `filePathName`：

```typescript
// src/stores/staticRoutes.ts
{
  url: '/feiyong/two-one/organization/:id',
  filePath: () => import('@/views/feiyong/two-one/detail/index.vue'),
  filePathName: 'feiyong-two-one-organization-detail',
  paramsTitle: 'id',
  activeMenu: 'feiyong-two-one-organization'
}
```

### 7.5 文件与目录命名

| 类型       | 命名风格                   | 示例                                    |
| ---------- | -------------------------- | --------------------------------------- |
| 视图目录   | camelCase                  | `feiyong/`、`twoOne/`、`clockLocation/` |
| 页面入口   | `index.vue`                | `organization/index.vue`                |
| 子组件     | PascalCase.vue             | `FormDrawer.vue`、`SearchCard.vue`      |
| 布局组件   | kebab-case.vue             | `header.vue`、`tags-view.vue`           |
| API 文件   | camelCase.ts               | `userInfo.ts`、`orderList.ts`           |
| 类型文件   | camelCase.ts               | `global.ts`、`orderList.ts`             |
| Store 文件 | camelCase                  | `userInfo.ts`、`tagsView.ts`            |
| Hooks 文件 | camelCase                  | `waterMark.ts`                          |
| 枚举/常量  | camelCase                  | `dictType.ts`、`flowApproval.ts`        |
| 测试文件   | `*.spec.ts` 或 `*.test.ts` | `http.spec.ts`                          |

> **重要**：`src/api/` 和 `src/types/` 目录下的 `.ts` 文件**必须使用 camelCase**，禁止 kebab-case。

### 7.6 代码命名

| 类型         | 命名风格                      | 示例                               |
| ------------ | ----------------------------- | ---------------------------------- |
| 组件 name    | 模块片段用 `-` 拼接           | `feiyong-two-one-organization`     |
| Store 导出名 | `use` + PascalCase + `Store`  | `useUserInfoStore`                 |
| Store ID     | PascalCase                    | `'UserInfo'`、`'TagsView'`         |
| 事件处理器   | `handle` + 动作名             | `handleSubmit()`、`handleSearch()` |
| 异步数据加载 | `load` + 数据名               | `loadData()`、`loadDetail()`       |
| 响应式变量   | camelCase（不加 Ref 后缀）    | `loading`、`drawerVisible`         |
| 布尔变量     | `is/has/should/can/show` 前缀 | `isLoading`、`showSearch`          |
| 常量         | SCREAMING_SNAKE_CASE          | `MAX_RETRY_COUNT`                  |
| 接口         | PascalCase + VO 后缀          | `UserInfoResponse`                 |
| CSS 变量     | `--zm-` + kebab-case          | `--zm-header-height`               |

### 7.7 Git 提交规范

#### 分支命名

```
<type>/<short-description>
```

| 类型        | 用途      | 示例                     |
| ----------- | --------- | ------------------------ |
| `feat/`     | 新功能    | `feat/attendance-group`  |
| `fix/`      | Bug 修复  | `fix/auth-redirect-loop` |
| `refactor/` | 重构      | `refactor/http-module`   |
| `docs/`     | 文档更新  | `docs/route-menu-guide`  |
| `chore/`    | 构建/配置 | `chore/upgrade-deps`     |

#### 提交信息格式

```
<type>(<scope>): <subject>

[body]

[footer]
```

示例：

```
feat(feiyong): 新增费用管理页面

后端已提供费用 CRUD 接口，前端需要配套的管理页面，
支持新增、编辑、删除和导出功能。

Closes #12
```

### 7.8 代码注释规范

- **必须保留原有代码中的注释**
- 解释"为什么"而非"做了什么"
- TODO/FIXME/HACK 标记格式：`// TODO: [姓名] 2026-05-01 描述`

---

## 8. 公共组件与样式

### 8.1 公共组件

| 组件    | 路径                           | 用途       |
| ------- | ------------------------------ | ---------- |
| `empty` | `@/components/empty/index.vue` | 空状态展示 |

### 8.2 布局组件

| 组件          | 路径                                             | 用途                            |
| ------------- | ------------------------------------------------ | ------------------------------- |
| `Layout`      | `@/views/layout/index.vue`                       | 主布局（Header+侧边栏+内容区）  |
| `Header`      | `@/views/layout/components/header.vue`           | 顶部导航栏（一级菜单+更多折叠） |
| `HeaderRight` | `@/views/layout/components/header-right.vue`     | 右侧用户信息（公司切换+退出）   |
| `TagsView`    | `@/views/layout/components/tags-view.vue`        | 标签页视图（关闭/刷新/滚动）    |
| `MenuTree`    | `@/views/layout/components/menuTree/index.vue`   | 侧边菜单树（四级+悬浮+收藏）    |
| `Breadcrumb`  | `@/views/layout/components/breadcrumb/index.vue` | 面包屑导航                      |
| `ZmLogo`      | `@/views/layout/components/zm-logo.vue`          | 中煤 Logo SVG                   |

### 8.3 公共样式变量

项目 CSS 变量统一定义在 `src/assets/style/restcss.css` 中：

#### Element Plus 主题覆盖

| 变量                 | 值         | 说明   |
| -------------------- | ---------- | ------ |
| `--el-color-primary` | #0083ff    | 主色   |
| `--el-color-success` | #33a647    | 成功色 |
| `--el-color-warning` | #fda413    | 警告色 |
| `--el-color-danger`  | #cc0000    | 危险色 |
| `--el-font-family`   | PingFangSC | 字体   |

#### 业务自定义变量

| 变量                    | 值   | 说明           |
| ----------------------- | ---- | -------------- |
| `--zm-header-height`    | 78px | 顶部导航栏高度 |
| `--zm-footer-height`    | 32px | 底部栏高度     |
| `--zm-tags-view-height` | 45px | 标签页栏高度   |
| `--zm-nav-opacity`      | 0.8  | 导航栏透明度   |

#### 全局组件样式定制

在 `restcss.css` 的 `#app` 作用域下，对 Element Plus 组件进行了全局样式定制：

- **Button**：统一 padding 为 `5px 16px`
- **Dialog**：圆角 8px，header 灰色背景+底部阴影，footer 顶部阴影

---

## 9. 路由系统

### 9.1 路由架构

```
静态路由（router/index.ts）
  ├── /redirect          # 页面刷新中间跳转
  ├── /about             # 测试页面
  ├── /http              # 测试页面
  └── /test1             # 测试页面

动态路由（asyncRoutes.ts + router.beforeEach）
  ├── /                  # Layout 布局
  │   ├── home           # 首页
  │   ├── feiyong        # 一级菜单1（费用）
  │   │   ├── two-one    # 二级菜单
  │   │   │   ├── organization  # 三级菜单
  │   │   │   ├── add          # 添加页（hidden）
  │   │   │   └── detail       # 详情页（动态参数 :id，hidden）
  │   │   ├── two-two    # 二级菜单
  │   │   │   └── tenant # 三级菜单
  │   │   └── duizhang12~16  # 二级菜单
  │   ├── huoyuan        # 一级菜单2（货源）
  │   │   ├── two-one/lixiang/list  # 四级菜单
  │   │   └── ...        # 支持五级嵌套
  │   ├── caiwu          # 一级菜单3（财务）
  │   ├── tongji         # 一级菜单4（统计）
  │   ├── yingxiao       # 一级菜单6（营销，动态参数 :id）
  │   └── kefu           # 一级菜单7（客服）
  └── /:pathMatch(.*)*   # 404 兜底
```

### 9.2 动态路由生成流程

1. 用户登录后，`router.beforeEach` 检查是否有用户信息
2. 调用 `useUserInfoStore.setUserInfo()` 获取用户信息 + 菜单树
3. `asyncRoutes.ts` 根据菜单树动态生成路由配置
4. 使用 `import.meta.glob` 预收集所有视图组件
5. 通过 `router.addRoute()` 注入动态路由

### 9.3 路由守卫逻辑

```
beforeEach(to)
  ├── noRequireAuth? → 直接放行
  ├── URL 带 token? → 存储到 localStorage，清除 URL 参数
  ├── keepAlive? → 添加到缓存列表
  ├── 有 Authorization? → 检查用户信息
  │   ├── 有用户信息 → 放行
  │   └── 无用户信息 → 获取用户信息 → 生成动态路由 → 重定向
  └── 无 Authorization → 跳转统一认证中心
```

### 9.4 asyncRoutes.ts 核心函数

| 函数                 | 用途                                                   |
| -------------------- | ------------------------------------------------------ |
| `filterMenuItems`    | 过滤外链菜单（http/https/协议相对URL）                 |
| `getRouteName`       | 获取路由名称（优先 filePathName，否则 URL 拼接）       |
| `getRouteComponent`  | 获取路由组件（优先 filePath，否则从 viewModules 查找） |
| `buildRoute`         | 递归构建路由节点（第一个子路由 path 为空）             |
| `createDynamicRoute` | 根据菜单数据动态创建路由配置                           |

### 9.5 staticRoutes.ts 前端静态配置

`staticRoutes.ts` 导出 `dynamicMenuTree` 数组，用于配置前端静态路由字段：

| 字段                | 类型     | 说明                                   |
| ------------------- | -------- | -------------------------------------- |
| `cached`            | boolean  | 是否缓存页面（keep-alive）             |
| `activeMenu`        | string   | 侧边栏高亮菜单项 name                  |
| `activePopoverMenu` | string   | 悬浮菜单高亮项 name                    |
| `filePath`          | Function | 动态路由手动指定组件路径               |
| `filePathName`      | string   | 动态路由手动指定 name                  |
| `paramsTitle`       | string   | 动态参数标题 key（用于标签页标题展示） |

---

## 10. 状态管理

### 10.1 Store 列表

| Store               | 文件                  | 用途                       |
| ------------------- | --------------------- | -------------------------- |
| `useUserInfoStore`  | `stores/userInfo.ts`  | 用户信息、菜单树、按钮权限 |
| `useTagsViewStore`  | `stores/tagsView.ts`  | 标签页管理                 |
| `useKeepAliveStore` | `stores/keepAlive.ts` | 页面缓存管理               |

> **辅助文件**：`menuData.ts`（模拟菜单数据，演示用）和 `staticRoutes.ts`（前端静态路由配置）不是 Pinia Store，但存放在 stores 目录下。

### 10.2 Setup Store 标准结构

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useXxxStore = defineStore('Xxx', () => {
  // ==================== State ====================
  const data = ref<Type | null>(null)
  const loading = ref(false)

  // ==================== Getters ====================
  const filteredList = computed(() => /* ... */)

  // ==================== Actions ====================
  async function fetchData() {
    loading.value = true
    try {
      const res = await getXxxApi()
      if (res.code === '200') {
        data.value = res.data
      }
    } finally {
      loading.value = false
    }
  }

  // ==================== Return ====================
  return { data, loading, filteredList, fetchData }
})
```

> **禁止使用 Options Store 风格**，必须使用 Setup Store 风格。

### 10.3 Store 详解

#### useUserInfoStore

- **Store ID**：`'UserInfo'`
- **状态**：`userInfo`（UserInfoResponse | null）、`menuTree`（MenuItem[]）
- **核心方法**：`setUserInfo()` — 获取用户信息并生成动态路由
- **内部函数**：`mergeMenuTree` — 将前端静态配置字段合并到后端菜单数据

#### useTagsViewStore

- **Store ID**：`'TagsView'`
- **状态**：`visitedViews`、`refreshSeed`
- **方法**：`setTagsView`、`delTagsView`、`refreshVisitedView`、`delOthersVisitedViews`、`delAllVisitedViews`、`updateVisitedView`
- 关闭标签页时同步清除 keep-alive 缓存；`refreshVisitedView` 递增 `refreshSeed`，由布局层作为页面组件 key 触发重建（不再跳 `/redirect`）

#### useKeepAliveStore

- **Store ID**：`'KeepAlive'`
- **状态**：`firstKeepAliveRoute`（一级路由缓存）、`secondKeepAliveRoute`（二级路由缓存）
- **方法**：`setKeepAlive`、`setNoKeepAlive`

---

## 11. API 层与 HTTP 封装

### 11.1 Axios 封装

`src/utils/http.ts` 封装了 Axios 实例：

- **baseURL**：从 `VITE_BASE_ORIGIN` 环境变量读取
- **超时**：60 秒
- **请求拦截器**：自动注入 `Authorization` 请求头（从 localStorage 读取）
- **响应拦截器**：统一处理 HTTP 错误
  - **401**：登录过期，自动调用统一认证中心接口重新登录
  - **403**：权限不足提示
  - **404**：资源未找到提示
  - **500**：服务器错误提示
  - 其他错误：显示 HTTP 状态码和状态文本
- **响应数据**：`response.data` 直接返回（不包裹在 AxiosResponse 中）

### 11.2 现有 API 接口

`src/api/api.ts` 提供以下接口：

| 函数          | 方法 | 路径                              | 说明             |
| ------------- | ---- | --------------------------------- | ---------------- |
| `getUserInfo` | GET  | `/v1/webapi/user/currentUserInfo` | 获取当前用户信息 |
| `logout`      | POST | `/v1/webapi/cas/client/logout`    | 退出登录         |

### 11.3 API 文件标准模式

新增业务 API 时，按模块分目录创建：

```typescript
// src/api/{module}/{feature}.ts
import axios from '@/utils/http';

const BASE_URL = '/api/xxx';

export function getXxxById(id: number) {
  return axios.get(`${BASE_URL}/${id}`);
}

export function getXxxPage(params: Record<string, unknown>) {
  return axios.get(`${BASE_URL}/page`, { params });
}

export function createXxx(data: Record<string, unknown>) {
  return axios.post(`${BASE_URL}/`, data);
}

export function updateXxx(data: Record<string, unknown>) {
  return axios.put(`${BASE_URL}/`, data);
}

export function deleteXxx(id: number) {
  return axios({ method: 'delete', url: `${BASE_URL}/${id}` });
}
```

### 11.4 API 调用规范

```typescript
async function loadData() {
  loading.value = true;
  try {
    const res = await getUserInfo();
    if (Number(res.code) === 200) {
      userInfo.value = res.data;
    } else {
      ElMessage.error(res.msg || '获取数据失败');
    }
  } catch {
    // 错误已在拦截器提示
  } finally {
    loading.value = false;
  }
}
```

---

## 12. 环境变量

### 12.1 环境变量文件

| 文件               | 用途         | Git 追踪              |
| ------------------ | ------------ | --------------------- |
| `.env.development` | 开发环境配置 | ✅                    |
| `.env.production`  | 生产环境配置 | ✅                    |
| `.env.local`       | 本地覆盖配置 | ❌（.gitignore 排除） |

### 12.2 当前配置

```bash
# .env.development
VITE_BASE_ORIGIN = "http://172.16.192.251:31822"
VITE_IDAAS_ORIGIN = "http://paas-web-dev.chinacoal.com"

# .env.production
VITE_BASE_ORIGIN = "http://172.16.192.251:31822"
VITE_IDAAS_ORIGIN = "http://paas-web.cloud.chinacoal.com"
```

| 变量                | 说明                   | 使用位置                       |
| ------------------- | ---------------------- | ------------------------------ |
| `VITE_BASE_ORIGIN`  | 后端 API 基础地址      | `src/utils/http.ts`（baseURL） |
| `VITE_IDAAS_ORIGIN` | IDaaS 统一认证平台域名 | 顶部导航栏图标字体域名         |

### 12.3 安全红线

- **绝对禁止**将 API 密钥、数据库密码等敏感信息放在 `VITE_` 变量中
- 所有以 `VITE_` 开头的环境变量都会被注入到客户端代码中
- 新增环境变量时**必须同步更新**所有环境的 `.env.*` 文件

---

## 13. 代码质量保障

### 13.1 ESLint 配置

```javascript
// eslint.config.js（Flat Config）
export default [
  {
    ignores: ['dist', 'dist-ssr', 'coverage', '*.local', ...]
  },
  ...pluginVue.configs['flat/essential'],
  ...eslintConfigTypescript(),
  eslintConfigPrettier,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
];
```

### 13.2 Prettier 配置

```json
{
  "tabWidth": 2,
  "singleQuote": true,
  "printWidth": 100,
  "htmlWhitespaceSensitivity": "ignore",
  "trailingComma": "none"
}
```

### 13.3 Git Hooks

通过 Husky + lint-staged 实现提交前自动检查：

```json
{
  "lint-staged": {
    "*.{vue,js,jsx,cjs,mjs,ts,tsx,cts,mts}": ["eslint --cache --fix --max-warnings=0"],
    "*.{vue,js,jsx,cjs,mjs,ts,tsx,cts,mts,json,css,scss,md}": ["prettier --write"]
  }
}
```

### 13.4 Vite 构建优化

```typescript
build: {
  assetsInlineLimit: 10240,  // <10KB 内联为 base64
  rollupOptions: {
    output: {
      manualChunks: {
        lodashEs: ['lodash-es'],
        vue: ['vue'],
        vueRouter: ['vue-router'],
      }
    }
  }
}
```

### 13.5 Vitest 配置

```typescript
// vitest.config.ts
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*']
    }
  })
);
```

---

## 14. 问题排查

### 14.1 页面白屏/报错

- 检查浏览器控制台是否有 Vue 或 JavaScript 错误
- 检查是否有组件引入路径错误
- 检查是否有类型错误导致编译失败

### 14.2 路由刷新后 404

- 确认动态路由是否通过 `router.addRoute` 正确注入
- 检查路由守卫中的重定向逻辑
- 确认路由 path 与 `src/views/` 目录名一致（驼峰命名）
- 检查 `import.meta.glob` 是否能匹配到对应的视图组件

### 14.3 接口超时/报错

- 检查 Network 面板请求是否正常发送
- 检查后端返回的 code 和 msg
- 检查 `res.code === '200'` 判断逻辑
- 检查 token 是否过期（401 错误）
- 检查 `VITE_BASE_ORIGIN` 环境变量是否正确

### 14.4 样式/布局错乱

- 检查是否正确使用 `<style scoped>`
- 检查是否正确使用 CSS 变量（`--zm-` 前缀）
- 检查 Element Plus 组件样式覆盖是否使用 `:deep()` 穿透

### 14.5 Token 过期/登录问题

- 检查 `localStorage` 中的 Authorization
- 检查 401 错误是否自动跳转统一认证中心
- 检查 URL 中是否携带 token 参数
- 检查多页签切换时 token 是否一致

### 14.6 菜单/路由不显示

- 检查 `menuData.ts` 中的模拟数据是否正确（演示模式）
- 检查菜单 URL 是否以 `http://` 或 `https://` 开头（外链会被过滤）
- 检查 `staticRoutes.ts` 中的 `dynamicMenuTree` 配置是否匹配
- 检查视图组件路径是否与 `import.meta.glob` 匹配

---

## 附录 A：更新日志

### V3.1 (2026-06-16)

#### 🔧 调整内容

- **项目定位更正**：从"假勤管理系统"更正为"Vue3 前端脚手架模板"，反映项目实际定位
- **目录结构全面更新**：移除不存在的目录和文件（enums/、dictStore、routes/ 子目录、apiCommon.ts 等），补充实际存在的文件
- **公共组件更新**：移除不存在的组件（searchCard、ButtonList、ZmPagination、headerBack），新增布局组件文档
- **字典系统章节移除**：项目当前版本无字典系统，移除整个字典章节
- **Store 列表更新**：移除不存在的 Store（dictStore、routes/ 子目录），补充 Store 详解
- **API 层更新**：反映实际 api.ts 内容，新增现有 API 接口表
- **路由系统更新**：更新路由架构图和示例，新增 asyncRoutes 核心函数和 staticRoutes 配置说明
- **CSS 变量更新**：从 variables.css 更正为 restcss.css，补充完整变量列表和全局组件样式定制说明
- **规则数量更正**：从 20 个更正为 19 个，全局生效规则从 14 个更正为 13 个
- **环境变量说明增强**：新增变量用途和使用位置说明
- **问题排查增强**：新增菜单/路由不显示排查步骤
- **代码示例更新**：所有代码示例从考勤系统改为通用脚手架示例

### V3.0 (2026-06-11)

#### ✨ 新增内容

- **Trae IDE 规则体系**：完整收录开发规范规则的分类、优先级和核心内容
- **Trae IDE Skills 体系**：完整收录 8 个开发技能的使用方式和触发词
- **目录结构全面更新**：反映项目最新目录结构，包括 .trae/ 配置目录、specs/ 规格文档目录
- **字典系统完整文档**：从架构到使用的完整说明
- **路由系统完整文档**：动态路由生成流程、路由守卫逻辑
- **状态管理文档**：Store 列表和 Setup Store 标准结构
- **API 层文档**：Axios 封装说明和 API 文件标准模式
- **环境变量文档**：当前配置和安全红线
- **代码质量保障文档**：ESLint、Git Hooks、Vite 构建优化
- **问题排查文档**：常见问题排查步骤

#### 🔧 调整内容

- 文档格式从 .docx 升级为 .md（便于版本控制和 Trae IDE 引用）
- 规则分类从 V2.0 的简单罗列升级为"全局生效 + 按需请求"两层体系
- 目录结构说明从概要升级为完整的三级目录树

### V2.0 (2026-05-13)

- 优化规则分层：将规则分为"全局生效"和"按需请求"两类
- 精准匹配：每个 rule 都有明确的适用范围描述
- 13 个核心规范改为全局生效
- 3 个辅助规范改为按需请求
