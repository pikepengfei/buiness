import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`✅ Centremix 官网后端已启动: http://localhost:${config.port}${config.apiPrefix}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 优雅停机：收到终止信号时先关闭 HTTP 服务（停止接收新连接并等待在途请求），
  // 再释放数据库连接池，避免连接泄漏与请求被硬切断。
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`收到 ${signal}，开始优雅停机…`);
    // 兜底超时：10s 内未能正常关闭则强制退出
    const force = setTimeout(() => {
      app.log.error('停机超时，强制退出');
      process.exit(1);
    }, 10_000);
    force.unref();
    try {
      await app.close();
      await pool.end();
      app.log.info('已完成停机');
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  // 未捕获异常/未处理拒绝：记录后触发优雅关闭，避免进程僵尸化
  process.on('uncaughtException', (err) => {
    app.log.error(err);
    void shutdown('uncaughtException' as NodeJS.Signals);
  });
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'unhandledRejection');
  });
}

main();
