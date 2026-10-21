# Centremix 芯联创 · 官网后端服务

基于 **Node.js + TypeScript + Fastify** 的企业官网后端，提供：

- 🔐 用户登录鉴权（JWT 双令牌 + RBAC 角色权限）
- 🗂 内容管理 CMS（页面 / 资讯 / 产品 / 分类 / Banner / FAQ / 站点设置 / 媒体库）
- 📨 表单与线索（询价 / 合作意向 / 订阅 / 售后联系，含状态机与看板）
- ☁️ 云端存储接入（S3 兼容对象存储，支持预签名直传；本地模式降级）
- 🛢 云端数据库（PostgreSQL，schema 见 `sql/schema.sql`）

## 目录结构
```
backend/
├── sql/schema.sql          # 建表 + 种子数据
├── src/
│   ├── config.ts           # 环境变量
│   ├── db.ts               # PostgreSQL 连接池
│   ├── storage.ts          # 对象存储（S3 兼容 / 本地）
│   ├── lib.ts              # JWT / 密码 / XSS / 响应 / RBAC
│   ├── middleware/auth.ts  # 鉴权与权限中间件
│   ├── routes/
│   │   ├── auth.ts         # /api/auth/*
│   │   ├── users.ts        # /api/users/*, /api/roles
│   │   ├── content.ts      # /api/pages,articles,products,banners,faqs,settings,menus,media,audit
│   │   ├── forms.ts        # /api/forms/*, /api/leads/*
│   │   ├── upload.ts       # /api/upload/*
│   │   └── public.ts       # /api/public/*  (前端只读接口)
│   ├── app.ts              # Fastify 装配
│   └── server.ts           # 入口
├── scripts/setup-admin.ts  # 创建首个管理员
└── .env.example
```

## 快速开始
```bash
cp .env.example .env          # 填写 DATABASE_URL / JWT_SECRET / 对象存储等
npm install
psql "$DATABASE_URL" -f sql/schema.sql     # 初始化数据库
npm run setup-admin           # 创建管理员（可用环境变量覆盖默认账号）
npm run dev                   # http://localhost:3000/api
```

## 接口总览（详见《后端执行文档.md》）
| 分组 | 路径前缀 | 鉴权 |
|---|---|---|
| 鉴权 | `/api/auth` | 登录公开，其余需令牌 |
| 用户/角色 | `/api/users`,`/api/roles` | 需 `user:write` |
| 内容 CMS | `/api/pages` `/api/articles` `/api/products` `/api/banners` `/api/faqs` `/api/settings` `/api/menus` `/api/media` `/api/audit` | 需 `content:read` / `content:write` |
| 表单/线索 | `/api/forms`(公开) `/api/leads`(需 `lead:read/write`) | 提交公开，管理需权限 |
| 上传 | `/api/upload` | 需 `media:write` |
| 公开只读 | `/api/public/*` | 无 |

## 说明
- 富文本（资讯正文 / FAQ / 页面区块）入库前经 `sanitize-html` 清洗，防止存储型 XSS。
- 刷新令牌仅存 SHA-256 哈希，原始令牌不落库；登出即吊销。
- 生产建议使用 Supabase / 云厂商 PostgreSQL + 对象存储（公共读 + CDN），详见部署文档。
