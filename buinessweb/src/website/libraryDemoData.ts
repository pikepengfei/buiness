/**
 * 组件库预览用的内置占位样例（纯数据）。
 * 单独成文件、不 import sectionRegistry，避免与注册表的组件导入形成循环引用。
 * 只在 demo 模式下被数据驱动区块读取，绝不落库、不进入保存链路。
 */
import type {
  ArticleCategory,
  ArticleSummary,
  Faq,
  ProductCategory,
  ProductSummary,
} from '@/types/cms';

export const DEMO_PRODUCTS: ProductSummary[] = [
  {
    id: -1,
    slug: 'demo-storage-1',
    name: '示例产品 · 便携固态存储',
    series: '移动存储系列',
    cover_image: null,
    summary: '组件库示例内容：轻巧机身与高速读写，适合外出创作与备份。',
    price_text: '¥ 699 起',
    category: '移动存储',
  },
  {
    id: -2,
    slug: 'demo-storage-2',
    name: '示例产品 · 桌面扩展坞',
    series: '桌面扩展系列',
    cover_image: null,
    summary: '组件库示例内容：多接口扩展，一站连接显示、存储与网络。',
    price_text: '¥ 1,299 起',
    category: '桌面扩展',
  },
  {
    id: -3,
    slug: 'demo-storage-3',
    name: '示例产品 · 企业级阵列',
    series: '企业存储系列',
    cover_image: null,
    summary: '组件库示例内容：面向团队的可靠阵列与集中管理方案。',
    price_text: null,
    category: '企业存储',
  },
];

export const DEMO_ARTICLES: ArticleSummary[] = [
  {
    id: -1,
    slug: 'demo-news-1',
    title: '示例资讯 · 新品发布与产品路线',
    cover_image: null,
    summary: '组件库示例内容：介绍本季新品与后续规划。',
    tags: ['品牌动态'],
    author: '芯联创',
    published_at: '2026-11-01T09:00:00.000Z',
    category: '品牌动态',
  },
  {
    id: -2,
    slug: 'demo-news-2',
    title: '示例资讯 · 存储技术白皮书解读',
    cover_image: null,
    summary: '组件库示例内容：解读新一代存储介质的技术要点。',
    tags: ['技术洞察'],
    author: '芯联创',
    published_at: '2026-10-24T09:00:00.000Z',
    category: '技术洞察',
  },
  {
    id: -3,
    slug: 'demo-news-3',
    title: '示例资讯 · 合作伙伴计划启动',
    cover_image: null,
    summary: '组件库示例内容：面向渠道伙伴的支持计划正式上线。',
    tags: ['公司新闻'],
    author: '芯联创',
    published_at: '2026-10-12T09:00:00.000Z',
    category: '公司新闻',
  },
];

export const DEMO_FAQS: Faq[] = [
  { id: -1, question: '示例问题：如何选择合适的存储容量？', answer: '组件库示例内容：按日常数据量与备份周期估算，建议留出 30% 余量。', category: '售前咨询', sort: 1 },
  { id: -2, question: '示例问题：产品质保期是多久？', answer: '组件库示例内容：不同系列质保政策不同，请以购买页面说明为准。', category: '售后服务', sort: 2 },
  { id: -3, question: '示例问题：是否支持企业批量采购？', answer: '组件库示例内容：支持，可通过联系表单提交需求。', category: '售前咨询', sort: 3 },
];

export const DEMO_PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: -1, name: '移动存储', slug: 'portable', description: null, parent_id: null, sort: 1 },
  { id: -2, name: '桌面扩展', slug: 'desktop', description: null, parent_id: null, sort: 2 },
  { id: -3, name: '企业存储', slug: 'enterprise', description: null, parent_id: null, sort: 3 },
];

export const DEMO_ARTICLE_CATEGORIES: ArticleCategory[] = [
  { id: -1, name: '品牌动态', slug: 'brand', description: null, sort: 1 },
  { id: -2, name: '技术洞察', slug: 'tech', description: null, sort: 2 },
  { id: -3, name: '公司新闻', slug: 'company', description: null, sort: 3 },
];
