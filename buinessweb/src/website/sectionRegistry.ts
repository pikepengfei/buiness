/**
 * 官网区块注册表：type → { label, component, defaultProps, formSchema }
 *
 * - defaultProps：管理端「新增区块」时的初始内容骨架
 * - formSchema：管理端通用表单渲染器（BlockForm）按此描述生成编辑控件
 * - 字段 kind 共 10 种：text / textarea / html / number / image / select /
 *   lines(字符串数组) / link({text,link} 对象) / object(子表单) / list(对象 repeater)
 *
 * 各类型 props 结构与 backend/sql/migrations/002_page_blocks.sql 种子保持一致，
 * 修改时务必两侧同步。
 */
import { markRaw, type Component } from 'vue';
import { SECTION_ICON_KEYS } from './icons';
import SecHero from './sections/SecHero.vue';
import SecPageHero from './sections/SecPageHero.vue';
import SecIntroEco from './sections/SecIntroEco.vue';
import SecMvv from './sections/SecMvv.vue';
import SecValues from './sections/SecValues.vue';
import SecTimeline from './sections/SecTimeline.vue';
import SecStory from './sections/SecStory.vue';
import SecCatGrid from './sections/SecCatGrid.vue';
import SecCapFlow from './sections/SecCapFlow.vue';
import SecPosterGrid from './sections/SecPosterGrid.vue';
import SecFeatureProducts from './sections/SecFeatureProducts.vue';
import SecLatestNews from './sections/SecLatestNews.vue';
import SecProductGrid from './sections/SecProductGrid.vue';
import SecNewsFeed from './sections/SecNewsFeed.vue';
import SecPmEntry from './sections/SecPmEntry.vue';
import SecFaqList from './sections/SecFaqList.vue';
import SecContactForm from './sections/SecContactForm.vue';
import SecCtaBanner from './sections/SecCtaBanner.vue';
import SecRichText from './sections/SecRichText.vue';

export type FieldKind =
  | 'text' | 'textarea' | 'html' | 'number' | 'image' | 'select'
  | 'lines' | 'link' | 'object' | 'list';

export interface FieldSchema {
  key: string;                 // props 内的字段名
  label: string;               // 表单标签
  kind: FieldKind;
  placeholder?: string;
  options?: { label: string; value: string }[]; // kind=select 的可选项
  itemLabel?: string;          // kind=list/object 的条目标题（支持 {字段} 占位）
  fields?: FieldSchema[];      // kind=list/object 的子字段
  tip?: string;                // 表单提示文案
}

export interface SectionMeta {
  label: string;               // 中文名（区块库/列表展示）
  group: string;               // 区块库分组
  component: Component;
  defaultProps: () => Record<string, any>;
  formSchema: FieldSchema[];
}

/** 通用「区块标题头」字段（eyebrow + 多行 title + desc），各区块复用 */
function headFields(opts?: { single?: boolean; withMore?: boolean }): FieldSchema[] {
  const fields: FieldSchema[] = [
    { key: 'eyebrow', label: '眉标（小标题）', kind: 'text', placeholder: '如：品牌介绍 · BRAND INTRODUCTION' },
    { key: 'title', label: '主标题', kind: 'lines', tip: '每行一条；可用 <em> 等安全标签高亮', placeholder: '标题行' },
    { key: 'desc', label: '描述文案', kind: 'textarea' },
  ];
  if (opts?.withMore) {
    fields.push(
      { key: 'moreText', label: '「更多」链接文字', kind: 'text', placeholder: '如：查看全部产品 →' },
      { key: 'moreLink', label: '「更多」链接地址', kind: 'text', placeholder: '如：/products' },
    );
  }
  return fields;
}

const THEME_OPTIONS = [
  { label: '默认（米白）', value: '' },
  { label: 'paper（纸白）', value: 'paper' },
];
const ICON_OPTIONS = SECTION_ICON_KEYS.map((k) => ({ label: k, value: k }));

export const SECTION_REGISTRY: Record<string, SectionMeta> = {
  hero: {
    label: '首页首屏 Hero',
    group: '头部与首屏',
    component: markRaw(SecHero),
    defaultProps: () => ({
      eyebrow: '', title: [''], lede: '',
      cta1: { text: '', link: '/products' }, cta2: { text: '', link: '/about' },
      meta: [], image: '', imageAlt: '',
      floaterLeft: { title: '', en: '' }, floaterRight: { title: '', en: '' },
    }),
    formSchema: [
      { key: 'eyebrow', label: '眉标', kind: 'text' },
      { key: 'title', label: '主标题（行）', kind: 'lines', tip: '每行一条；可用 <em> 高亮' },
      { key: 'lede', label: '导语', kind: 'textarea' },
      { key: 'cta1', label: '主按钮', kind: 'object', fields: [
        { key: 'text', label: '文字', kind: 'text' }, { key: 'link', label: '链接', kind: 'text' },
      ] },
      { key: 'cta2', label: '次按钮', kind: 'object', fields: [
        { key: 'text', label: '文字', kind: 'text' }, { key: 'link', label: '链接', kind: 'text' },
      ] },
      { key: 'meta', label: '底部三项数据', kind: 'list', itemLabel: '{label}', fields: [
        { key: 'label', label: '标签', kind: 'text', placeholder: '如：EST.' },
        { key: 'value', label: '值', kind: 'text' },
      ] },
      { key: 'image', label: '右侧配图', kind: 'image' },
      { key: 'imageAlt', label: '图片替代文字', kind: 'text' },
      { key: 'floaterLeft', label: '左侧浮动标签', kind: 'object', fields: [
        { key: 'title', label: '中文', kind: 'text' }, { key: 'en', label: '英文', kind: 'text' },
      ] },
      { key: 'floaterRight', label: '右侧浮动标签', kind: 'object', fields: [
        { key: 'title', label: '中文', kind: 'text' }, { key: 'en', label: '英文', kind: 'text' },
      ] },
    ],
  },
  'page-hero': {
    label: '内页头图',
    group: '头部与首屏',
    component: markRaw(SecPageHero),
    defaultProps: () => ({ crumb: [{ text: '首页', link: '/' }], title: [''], subtitle: '' }),
    formSchema: [
      { key: 'crumb', label: '面包屑', kind: 'list', itemLabel: '{text}', fields: [
        { key: 'text', label: '文字', kind: 'text' },
        { key: 'link', label: '链接（末级可留空）', kind: 'text' },
      ] },
      { key: 'title', label: '主标题（行）', kind: 'lines', tip: '每行一条；可用 <em> 高亮' },
      { key: 'subtitle', label: '副标题', kind: 'textarea' },
    ],
  },
  'intro-eco': {
    label: '品牌/公司介绍三栏',
    group: '图文内容',
    component: markRaw(SecIntroEco),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', items: [{ h4: '', p: '' }] }),
    formSchema: [
      ...headFields(),
      { key: 'items', label: '三栏条目', kind: 'list', itemLabel: '{h4}', fields: [
        { key: 'h4', label: '小标题', kind: 'text' },
        { key: 'p', label: '正文', kind: 'textarea' },
      ] },
    ],
  },
  mvv: {
    label: '使命与愿景',
    group: '图文内容',
    component: markRaw(SecMvv),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', cards: [{ tag: '', text: '' }] }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'cards', label: '卡片', kind: 'list', itemLabel: '{tag}', fields: [
        { key: 'tag', label: '标签', kind: 'text', placeholder: '如：BRAND MISSION · 品牌使命' },
        { key: 'text', label: '内容', kind: 'textarea' },
      ] },
    ],
  },
  values: {
    label: '品牌价值观',
    group: '图文内容',
    component: markRaw(SecValues),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', items: [{ icon: 'user', title: '', en: '', text: '' }] }),
    formSchema: [
      ...headFields(),
      { key: 'items', label: '价值条目（建议 3 或 4 条）', kind: 'list', itemLabel: '{title}', fields: [
        { key: 'icon', label: '图标', kind: 'select', options: ICON_OPTIONS },
        { key: 'title', label: '中文标题', kind: 'text' },
        { key: 'en', label: '英文标签', kind: 'text' },
        { key: 'text', label: '描述', kind: 'textarea' },
      ] },
    ],
  },
  timeline: {
    label: '时间轴（历程/流程）',
    group: '图文内容',
    component: markRaw(SecTimeline),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', items: [{ year: '', title: '', text: '' }] }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'items', label: '节点', kind: 'list', itemLabel: '{year}', fields: [
        { key: 'year', label: '年份 / 步骤', kind: 'text', placeholder: '如：2022 · 品牌创立' },
        { key: 'title', label: '标题', kind: 'text' },
        { key: 'text', label: '描述', kind: 'textarea' },
      ] },
    ],
  },
  story: {
    label: '深色品牌背景区（含品牌墙）',
    group: '图文内容',
    component: markRaw(SecStory),
    defaultProps: () => ({
      eyebrow: '', title: [''], paras: [''], pillars: [], image: '', imageAlt: '',
      backers: [{ title: '', desc: '' }], brandWall: [],
    }),
    formSchema: [
      { key: 'eyebrow', label: '眉标', kind: 'text' },
      { key: 'title', label: '主标题', kind: 'lines' },
      { key: 'paras', label: '正文段落', kind: 'lines', tip: '每段一条；留空则切换为纯背书双栏版式' },
      { key: 'pillars', label: '数据支柱', kind: 'list', itemLabel: '{cn}', fields: [
        { key: 'en', label: '英文（大字）', kind: 'text' },
        { key: 'cn', label: '中文', kind: 'text' },
      ] },
      { key: 'image', label: '右侧配图（选填）', kind: 'image' },
      { key: 'imageAlt', label: '图片替代文字', kind: 'text' },
      { key: 'backers', label: '背书卡片', kind: 'list', itemLabel: '{title}', fields: [
        { key: 'title', label: '标题', kind: 'text' },
        { key: 'desc', label: '内容', kind: 'textarea' },
      ] },
      { key: 'brandWall', label: '品牌墙（选填）', kind: 'list', itemLabel: '{text}', fields: [
        { key: 'text', label: '名称', kind: 'text' },
        { key: 'url', label: '外链（选填）', kind: 'text' },
      ] },
    ],
  },
  'cat-grid': {
    label: '类别卡片（场景/政策）',
    group: '图文内容',
    component: markRaw(SecCatGrid),
    defaultProps: () => ({
      eyebrow: '', title: [''], desc: '', theme: '',
      items: [{ num: '', icon: 'check', title: '', text: '', bullets: [] }],
    }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'items', label: '卡片', kind: 'list', itemLabel: '{title}', fields: [
        { key: 'num', label: '编号', kind: 'text', placeholder: '如：SCENE / 01' },
        { key: 'icon', label: '图标', kind: 'select', options: ICON_OPTIONS },
        { key: 'title', label: '标题', kind: 'text' },
        { key: 'text', label: '描述', kind: 'textarea' },
        { key: 'bullets', label: '要点列表', kind: 'lines' },
      ] },
    ],
  },
  'cap-flow': {
    label: '产品特性四宫格（深色）',
    group: '图文内容',
    component: markRaw(SecCapFlow),
    defaultProps: () => ({ eyebrow: '', title: [''], items: [{ step: '01', title: '', text: '', tags: [] }] }),
    formSchema: [
      { key: 'eyebrow', label: '眉标', kind: 'text' },
      { key: 'title', label: '主标题', kind: 'lines' },
      { key: 'items', label: '特性格', kind: 'list', itemLabel: '{step} {title}', fields: [
        { key: 'step', label: '序号', kind: 'text', placeholder: '如：01' },
        { key: 'title', label: '标题', kind: 'text' },
        { key: 'text', label: '描述', kind: 'textarea' },
        { key: 'tags', label: '标签', kind: 'lines' },
      ] },
    ],
  },
  'poster-grid': {
    label: '图文海报网格（产品速览）',
    group: '图文内容',
    component: markRaw(SecPosterGrid),
    defaultProps: () => ({
      eyebrow: '', title: [''], desc: '', theme: '', moreText: '', moreLink: '/products',
      items: [{ image: '', tag: '', caption: '', link: '/products' }],
    }),
    formSchema: [
      ...headFields({ withMore: true }),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'items', label: '海报表（建议 4 张）', kind: 'list', itemLabel: '{tag}', fields: [
        { key: 'image', label: '配图', kind: 'image' },
        { key: 'tag', label: '左上角标', kind: 'text', placeholder: '如：随身存储' },
        { key: 'caption', label: '底部说明', kind: 'text' },
        { key: 'link', label: '点击跳转（站内路径或外链）', kind: 'text', placeholder: '如：/products' },
      ] },
    ],
  },
  'feature-products': {
    label: '精选产品（API 驱动）',
    group: '数据驱动',
    component: markRaw(SecFeatureProducts),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', limit: 3, moreText: '查看全部产品 →', moreLink: '/products' }),
    formSchema: [
      ...headFields({ withMore: true }),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'limit', label: '展示数量', kind: 'number', tip: '取最新上架产品' },
    ],
  },
  'latest-news': {
    label: '最新资讯（API 驱动）',
    group: '数据驱动',
    component: markRaw(SecLatestNews),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', limit: 3, moreText: '查看全部资讯 →', moreLink: '/news' }),
    formSchema: [
      ...headFields({ withMore: true }),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'limit', label: '展示数量', kind: 'number', tip: '取最新发布资讯' },
    ],
  },
  'product-grid': {
    label: '产品矩阵列表（API 驱动）',
    group: '数据驱动',
    component: markRaw(SecProductGrid),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', pageSize: 9 }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'pageSize', label: '每页产品数', kind: 'number', tip: '分类筛选 / 搜索 / 排序为固定结构' },
    ],
  },
  'news-feed': {
    label: '资讯列表（API 驱动）',
    group: '数据驱动',
    component: markRaw(SecNewsFeed),
    defaultProps: () => ({ eyebrow: '', title: [], desc: '', theme: '', pageSize: 6 }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'pageSize', label: '每页资讯数', kind: 'number', tip: '区头留空则只显示列表；分类筛选 / 分页为固定结构' },
    ],
  },
  'pm-entry': {
    label: '产品矩阵入口（大字横幅）',
    group: '数据驱动',
    component: markRaw(SecPmEntry),
    defaultProps: () => ({ word: 'PRODUCTS', num: '00', title: '', sub: '', desc: '', btnText: '进入产品中心 →', btnLink: '/products' }),
    formSchema: [
      { key: 'word', label: '背景大字', kind: 'text' },
      { key: 'num', label: '编号', kind: 'text', placeholder: '如：03' },
      { key: 'title', label: '主标题', kind: 'text' },
      { key: 'sub', label: '英文副题（渲染为主标题第二行）', kind: 'text' },
      { key: 'desc', label: '描述', kind: 'textarea' },
      { key: 'btnText', label: '按钮文字', kind: 'text' },
      { key: 'btnLink', label: '按钮链接', kind: 'text' },
    ],
  },
  'faq-list': {
    label: '常见问题 FAQ（API 驱动）',
    group: '数据驱动',
    component: markRaw(SecFaqList),
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', theme: '', category: '' }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'category', label: 'FAQ 分类', kind: 'text', tip: '留空 = 全部分类' },
    ],
  },
  'contact-form': {
    label: '联系方式 + 申请表单',
    group: '转化组件',
    component: markRaw(SecContactForm),
    defaultProps: () => ({
      infoTitle: '联系我们', infoItems: [],
      formTitle: '留言表单', formDesc: '', typeOptions: ['其他'],
      agreeText: '我已阅读并同意《隐私政策》。', submitText: '提交 →',
    }),
    formSchema: [
      { key: 'infoTitle', label: '左栏标题', kind: 'text' },
      { key: 'infoItems', label: '联系方式条目', kind: 'list', itemLabel: '{label}', fields: [
        { key: 'icon', label: '符号（字符）', kind: 'text', placeholder: '如：☏ ✉ ⌂' },
        { key: 'label', label: '标签', kind: 'text' },
        { key: 'lines', label: '内容行', kind: 'lines' },
      ] },
      { key: 'formTitle', label: '表单标题', kind: 'text' },
      { key: 'formDesc', label: '表单说明', kind: 'textarea' },
      { key: 'typeOptions', label: '问题类型选项', kind: 'lines' },
      { key: 'agreeText', label: '隐私条款文字', kind: 'textarea' },
      { key: 'submitText', label: '提交按钮文字', kind: 'text' },
    ],
  },
  'cta-banner': {
    label: 'CTA 横幅',
    group: '转化组件',
    component: markRaw(SecCtaBanner),
    defaultProps: () => ({ title: '', desc: '', btnText: '联系我们 →', btnLink: '/contact' }),
    formSchema: [
      { key: 'title', label: '主文案', kind: 'text' },
      { key: 'desc', label: '副文案', kind: 'textarea' },
      { key: 'btnText', label: '按钮文字', kind: 'text' },
      { key: 'btnLink', label: '按钮链接', kind: 'text' },
    ],
  },
  'rich-text': {
    label: '通用富文本',
    group: '转化组件',
    component: markRaw(SecRichText),
    defaultProps: () => ({ eyebrow: '', title: [], desc: '', theme: '', html: '<p>请输入内容…</p>' }),
    formSchema: [
      ...headFields(),
      { key: 'theme', label: '背景', kind: 'select', options: THEME_OPTIONS },
      { key: 'html', label: '正文 HTML', kind: 'html', tip: '保存时后端自动清洗不安全标签' },
    ],
  },
};

/** 区块库分组清单（管理端「新增区块」面板用） */
export const SECTION_GROUPS: string[] = ['头部与首屏', '图文内容', '数据驱动', '转化组件'];

export function sectionLabel(type: string): string {
  return SECTION_REGISTRY[type]?.label || type;
}
