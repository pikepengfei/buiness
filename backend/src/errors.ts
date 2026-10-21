// =============================================================================
// 统一业务错误码体系
// =============================================================================
// 约定：HTTP 状态码表达传输语义（400/401/403/404/409/500 等），
//       业务错误码（code 字段）表达细粒度业务含义，便于前端按码做差异化处理。
// 错误码分区：
//   0      成功
//   1xxx   通用/参数类
//   2xxx   认证与权限
//   3xxx   内容与资源
//   4xxx   表单与线索
//   5xxx   存储与上传
//   9xxx   系统/数据库

export const ErrCode = {
  OK: 0,

  // --- 1xxx 通用/参数 ---
  BAD_REQUEST: 1001,        // 请求参数校验失败
  NO_UPDATE_FIELD: 1002,    // 无有效更新字段
  UNPROCESSABLE: 1003,      // 语义处理错误
  RELATION_NOT_FOUND: 1004, // 关联记录不存在（外键冲突）

  // --- 2xxx 认证与权限 ---
  UNAUTHORIZED: 2001,       // 未提供/无效令牌
  TOKEN_EXPIRED: 2002,      // 令牌过期
  INVALID_CREDENTIALS: 2003,// 用户名或密码错误
  ACCOUNT_DISABLED: 2004,   // 账号被禁用
  FORBIDDEN: 2005,          // 权限不足
  SESSION_INVALID: 2006,    // 会话已失效，需重新登录
  OLD_PASSWORD_WRONG: 2007, // 原密码错误

  // --- 3xxx 内容与资源 ---
  NOT_FOUND: 3001,          // 资源不存在
  SLUG_EXISTS: 3002,        // slug 已存在（唯一冲突）
  USERNAME_EXISTS: 3003,    // 用户名已存在

  // --- 5xxx 存储与上传 ---
  NO_FILE: 5001,            // 未收到文件
  STORAGE_MODE_MISMATCH: 5002, // 存储模式不匹配
  MEDIA_IN_USE: 5003,       // 素材被内容引用，禁止删除

  // --- 9xxx 系统/数据库 ---
  INTERNAL_ERROR: 9001,     // 服务器内部错误
  DB_ERROR: 9002,           // 数据库异常
} as const;

// HTTP 状态码与默认业务码的映射（当调用方未显式指定业务码时使用）
const HTTP_TO_BIZ: Record<number, number> = {
  400: ErrCode.BAD_REQUEST,
  401: ErrCode.UNAUTHORIZED,
  403: ErrCode.FORBIDDEN,
  404: ErrCode.NOT_FOUND,
  409: ErrCode.SLUG_EXISTS,
  422: ErrCode.UNPROCESSABLE,
  500: ErrCode.INTERNAL_ERROR,
};

/** 根据 HTTP 状态码推导默认业务错误码 */
export function bizCodeFromStatus(status: number): number {
  return HTTP_TO_BIZ[status] ?? ErrCode.INTERNAL_ERROR;
}

/** PostgreSQL 唯一约束冲突错误码（SQLSTATE 23505） */
export const PG_UNIQUE_VIOLATION = '23505';

/** PostgreSQL 外键约束冲突错误码（SQLSTATE 23503） */
export const PG_FK_VIOLATION = '23503';

/** 判断错误是否为 PG 唯一冲突 */
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === PG_UNIQUE_VIOLATION;
}

/** 判断错误是否为 PG 外键冲突（关联记录不存在） */
export function isForeignKeyViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === PG_FK_VIOLATION;
}
