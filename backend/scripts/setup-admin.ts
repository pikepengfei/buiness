import 'dotenv/config';
import { pool } from '../src/db.js';
import { hashPassword, sha256Hex } from '../src/lib.js';

// 创建首个超级管理员账号
// 用法: ADMIN_USERNAME=admin ADMIN_PASSWORD='Admin@123456' ADMIN_EMAIL=admin@example.com npm run setup-admin
// 账号已存在时需重置口令: ADMIN_PASSWORD_RESET=1 ADMIN_PASSWORD='Admin@123456' npm run setup-admin
async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const email = process.env.ADMIN_EMAIL || 'admin@centremix.com';
  const displayName = process.env.ADMIN_DISPLAY_NAME || '超级管理员';

  if (password.length < 8) {
    console.error('❌ 密码长度至少 8 位');
    process.exit(1);
  }

  const roleRes = await pool.query(`SELECT id FROM roles WHERE code='super_admin'`);
  if (!roleRes.rows[0]) {
    console.error('❌ 未找到 super_admin 角色，请先执行 sql/schema.sql');
    process.exit(1);
  }
  const roleId = roleRes.rows[0].id;

  // 与前端登录口径一致：先取口令的 SHA-256 摘要，再由服务端加盐 bcrypt
  const hash = await hashPassword(sha256Hex(password));

  const exist = await pool.query(`SELECT 1 FROM users WHERE username=$1`, [username]);
  if (exist.rows[0]) {
    if (process.env.ADMIN_PASSWORD_RESET !== '1') {
      console.log('ℹ️ 管理员账号已存在，跳过创建（需重置口令请加 ADMIN_PASSWORD_RESET=1）');
      await pool.end();
      return;
    }
    await pool.query(`UPDATE users SET password_hash=$1 WHERE username=$2`, [hash, username]);
    console.log(`✅ 管理员口令已重置  用户名: ${username}`);
    await pool.end();
    return;
  }

  await pool.query(
    `INSERT INTO users(username,email,password_hash,display_name,role_id,status)
     VALUES($1,$2,$3,$4,$5,1)`,
    [username, email, hash, displayName, roleId]
  );
  console.log(`✅ 管理员创建成功  用户名: ${username}  密码: ${password}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
