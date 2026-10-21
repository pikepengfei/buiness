import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  // 保持长连接活性，避免云端 LB/防火墙断开空闲连接后首次请求报错
  keepAlive: true,
  // 语句/查询超时防护，避免慢查询长期占用连接拖垮连接池
  statement_timeout: config.db.statementTimeoutMs,
  query_timeout: config.db.queryTimeoutMs,
});

pool.on('error', (err) => {
  // 连接池层面错误不应直接崩溃进程
  console.error('[db] unexpected pool error', err);
});

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<{ rows: T[]; rowCount: number | null }> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount };
  } finally {
    if (config.nodeEnv === 'development') {
      // 轻量 SQL 慢查询日志
      const ms = Date.now() - start;
      if (ms > 200) console.warn(`[db] slow query ${ms}ms:`, text.slice(0, 120));
    }
  }
}

export async function transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  const { rows } = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

// 单次往返分页查询：以窗口函数 COUNT(*) OVER() 合并总数统计，避免“数据+计数”两次往返。
// baseSql 需为完整的 SELECT ... FROM ... [WHERE ...] ORDER BY ...（不含 LIMIT/OFFSET）。
export async function queryPaginated<T = any>(
  baseSql: string,
  params: any[],
  limit: number,
  offset: number,
): Promise<{ rows: T[]; total: number }> {
  const sql =
    `SELECT *, COUNT(*) OVER()::int AS __total FROM (${baseSql}) AS __pg `
    + `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const { rows } = await query<any>(sql, [...params, limit, offset]);
  const total = rows.length ? (rows[0].__total as number) : 0;
  for (const r of rows) delete r.__total; // 剔除辅助列，保持与原有响应结构一致
  return { rows: rows as T[], total };
}
