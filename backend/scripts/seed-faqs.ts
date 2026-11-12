import 'dotenv/config';
import { pool } from '../src/db.js';

/**
 * FAQ 测试数据填充（开发库专用，不进迁移）
 * 用法: npm run seed-faqs
 * 按 question 去重，可重复执行；只想补新条目时直接再跑一次即可。
 * 覆盖场景：多分类 / 一条停用（验证公开接口 status=1 过滤）/ 一条含基础 HTML（验证官网纯文本渲染）
 */

type SeedFaq = { question: string; answer: string; category: string; sort: number; status: number };

const SEED: SeedFaq[] = [
  {
    question: 'Centremix 芯联创和希捷是什么关系？',
    answer: '芯联创是 2022 年与希捷工厂深度合作创立的自营存储品牌，硬盘出厂前经过产线全检与坏道筛查。',
    category: 'general',
    sort: 0,
    status: 1,
  },
  {
    question: '下单后多久发货？支持哪些快递？',
    answer: '工作日 16:00 前的订单当天出库，默认顺丰与京东物流，偏远地区时效顺延 1-2 天。',
    category: 'general',
    sort: 1,
    status: 1,
  },
  {
    question: '移动硬盘的质保期是多久？',
    answer: '<p>全系移动硬盘提供 <strong>3 年有限质保</strong>，质保期内非人为损坏免费换新。</p>',
    category: 'warranty',
    sort: 0,
    status: 1,
  },
  {
    question: 'NAS 盘与桌面盘质保有区别吗？',
    answer: 'NAS 盘与桌面盘均为 3 年质保；企业级系列提供 5 年质保，需保留订单凭证。',
    category: 'warranty',
    sort: 1,
    status: 1,
  },
  {
    question: '七天无理由退货的条件是什么？',
    answer: '商品未拆封或存在质量问题的前提下支持 7 天无理由退货；已激活的数据安全类产品需先完成数据清除证明。',
    category: 'return',
    sort: 0,
    status: 1,
  },
  {
    question: '退换货运费由谁承担？',
    answer: '质量问题由我方承担双向运费；无理由退货仅承担寄回运费，寄出运费不予退还。',
    category: 'return',
    sort: 1,
    status: 1,
  },
  {
    question: '硬盘出现坏道还能维修吗？',
    answer: '坏道属于盘体损耗，不做维修只做换新。送修前请自行备份，维修过程中数据不保留。',
    category: 'repair',
    sort: 0,
    status: 1,
  },
  {
    question: '维修需要多久能寄回？',
    answer: '收到故障件后 3 个工作日内完成检测，换新件 48 小时内寄出，可通过订单号查询进度。',
    category: 'repair',
    sort: 1,
    status: 0,
  },
];

async function main() {
  const before = await pool.query('SELECT count(*)::int AS c FROM faqs');
  console.log(`ℹ️ 当前 faqs 行数: ${before.rows[0].c}`);

  let inserted = 0;
  let skipped = 0;
  for (const f of SEED) {
    const exist = await pool.query('SELECT 1 FROM faqs WHERE question=$1', [f.question]);
    if (exist.rows[0]) {
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO faqs(question,answer,category,sort,status) VALUES($1,$2,$3,$4,$5)`,
      [f.question, f.answer, f.category, f.sort, f.status]
    );
    inserted++;
  }

  const after = await pool.query(
    `SELECT id, category, status, sort, left(question, 24) AS question
       FROM faqs ORDER BY category, sort, id`
  );
  console.log(`✅ 新增 ${inserted} 条，已存在跳过 ${skipped} 条，现共 ${after.rows.length} 条`);
  console.table(after.rows);
  console.log('ℹ️ 官网 /contact 的 FAQ 区块 category 留空 = 显示全部启用项；status=0 的那条只出现在管理列表。');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
