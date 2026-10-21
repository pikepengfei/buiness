import 'dotenv/config';

function str(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  port: num('PORT', 3000),
  nodeEnv: str('NODE_ENV', 'development'),
  frontendOrigin: str('FRONTEND_ORIGIN', 'http://localhost:5173'),
  apiPrefix: str('API_PREFIX', '/api'),

  databaseUrl: str('DATABASE_URL', 'postgres://user:password@localhost:5432/centremix'),

  // 连接池与查询防护参数（均可通过环境变量覆盖）
  db: {
    poolMax: num('DB_POOL_MAX', 10),
    idleTimeoutMs: num('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMs: num('DB_CONNECT_TIMEOUT_MS', 5000),
    statementTimeoutMs: num('DB_STATEMENT_TIMEOUT_MS', 15000), // 服务端语句超时
    queryTimeoutMs: num('DB_QUERY_TIMEOUT_MS', 20000),         // 客户端查询超时
  },

  // 公开接口 Cache-Control 最大年龄（秒）；<=0 表示禁用缓存
  publicCacheMaxAge: num('PUBLIC_CACHE_MAX_AGE', 60),

  jwt: {
    secret: str('JWT_SECRET', 'change_me_access_secret'),
    refreshSecret: str('JWT_REFRESH_SECRET', 'change_me_refresh_secret'),
    accessTtl: str('ACCESS_TOKEN_TTL', '2h'),
    refreshTtl: str('REFRESH_TOKEN_TTL', '14d'),
  },

  storage: {
    driver: str('STORAGE_DRIVER', 's3') as 's3' | 'local',
    bucket: str('STORAGE_BUCKET', 'website'),
    region: str('STORAGE_REGION', 'ap-beijing'),
    endpoint: str('STORAGE_ENDPOINT', 'https://s3.ap-beijing.amazonaws.com'),
    accessKey: str('STORAGE_ACCESS_KEY', ''),
    secretKey: str('STORAGE_SECRET_KEY', ''),
    publicBase: str('STORAGE_PUBLIC_BASE', 'https://cdn.example.com/website'),
    localDir: str('STORAGE_LOCAL_DIR', './uploads'),
  },

  rateLimit: {
    // 全局默认值：后台单页会并发发起多组列表/字典请求，过小会误伤正常操作；
    // 需要严格限流的敏感入口（登录）在各自路由上单独收紧。
    max: num('RATE_LIMIT_MAX', 300),
    windowMs: num('RATE_LIMIT_WINDOW', 60000),
  },

  bcryptRounds: num('BCRYPT_ROUNDS', 12),
};
