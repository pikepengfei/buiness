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
import UiText from '@/components/ui/UiText.vue';
import UiHeading from '@/components/ui/UiHeading.vue';
import UiImage from '@/components/ui/UiImage.vue';
import UiButton from '@/components/ui/UiButton.vue';

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

/** 组件库层级：module = 整页模块（对应一段背景带）；atom = 文字/图片/按钮等基础元素，只能被模块装载 */
export type BlockLayer = 'module' | 'atom';

/**
 * 模块的背景带：模块边界以「背景色来源」为准（相邻模块底色不同即为一段）
 * - form：bleed = section 自身通栏底色；card = 通栏内的卡片底色（卡片自带边框，与相邻段仍可见分界）
 * - source：fixed = 组件根类名写死；themeable = 随 props.theme 在 paper / 默认白之间切换；
 *   省略 source 且无 band 表示背景未指定，编辑器据此提示
 */
export interface BandInfo {
  form: 'bleed' | 'card';
  color: string;
  source?: 'fixed' | 'themeable';
}

export interface SectionMeta {
  label: string;               // 中文名（区块库/列表展示）
  group: string;               // 区块库分组
  component: Component;
  defaultProps: () => Record<string, any>;
  formSchema: FieldSchema[];
  layer?: BlockLayer;          // 缺省为 module
  band?: BandInfo;             // 模块的背景带；缺省表示背景未指定
  accepts?: BlockLayer[];      // 可装载的子内容层级；缺省按是否数据驱动推导
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

/** 组件库中基础元素层的分组名（数据源仍是本注册表的 layer 字段） */
export const ATOM_GROUP = '基础元素';

export const SECTION_REGISTRY: Record<string, SectionMeta> = {
  hero: {
    label: '首页首屏 Hero',
    group: '头部与首屏',
    component: markRaw(SecHero),
    layer: 'module',
    band: { form: 'bleed', color: 'var(--paper)', source: 'fixed' },
    accepts: ['atom'],
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
    layer: 'module',
    // 组件支持 theme，但默认内容与表单都未开放该开关，实际呈现为默认白底
    band: { form: 'bleed', color: 'var(--white)', source: 'themeable' },
    accepts: ['atom'],
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
    layer: 'module',
    band: { form: 'bleed', color: 'var(--paper)', source: 'themeable' },
    accepts: ['atom'],
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
    layer: 'module',
    // 同 intro-eco：组件支持 theme，默认按白底呈现
    band: { form: 'bleed', color: 'var(--white)', source: 'themeable' },
    accepts: ['atom'],
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
    layer: 'module',
    band: { form: 'bleed', color: 'var(--ink-950)', source: 'fixed' },
    accepts: ['atom'],
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
    layer: 'module',
    band: { form: 'bleed', color: 'var(--paper)', source: 'themeable' },
    // 列表来自公开接口，手工子内容会与之竞争同一版式位
    accepts: [],
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
    layer: 'module',
    band: { form: 'bleed', color: 'var(--paper)', source: 'themeable' },
    // 列表来自公开接口，不接受手工子内容
    accepts: [],
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
    layer: 'module',
    // 底色落在 .pm-entry 卡片上（自带 1px --ink-100 描边），与相邻通栏段可见分界
    band: { form: 'card', color: 'var(--ink-50)', source: 'fixed' },
    accepts: ['atom'],
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
    layer: 'module',
    band: { form: 'card', color: 'var(--ink-950)', source: 'fixed' },
    accepts: ['atom'],
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
  // ——— 基础元素层：与 src/components/ui 同一份实现，只能作为模块的子内容插入 ———
  'ui-text': {
    label: '文字',
    group: ATOM_GROUP,
    component: markRaw(UiText),
    layer: 'atom',
    accepts: [],
    defaultProps: () => ({ text: '', html: '', tone: 'body', size: 'md' }),
    formSchema: [
      { key: 'text', label: '文字内容', kind: 'textarea', tip: '纯文本，标签会被转义' },
      { key: 'html', label: '富文本（选填）', kind: 'html', tip: '填写后以富文本为准；保存时后端清洗' },
      { key: 'tone', label: '色阶', kind: 'select', options: [
        { label: '正文', value: 'body' }, { label: '次级', value: 'muted' }, { label: '反白', value: 'invert' },
      ] },
      { key: 'size', label: '字号', kind: 'select', options: [
        { label: '小', value: 'sm' }, { label: '中', value: 'md' }, { label: '大', value: 'lg' },
      ] },
    ],
  },
  'ui-heading': {
    label: '标题组',
    group: ATOM_GROUP,
    component: markRaw(UiHeading),
    layer: 'atom',
    accepts: [],
    defaultProps: () => ({ eyebrow: '', title: [''], desc: '', moreText: '', moreLink: '' }),
    formSchema: [
      { key: 'eyebrow', label: '眉标', kind: 'text' },
      { key: 'title', label: '主标题（行）', kind: 'lines', tip: '每行一条；可用 <em> 高亮' },
      { key: 'desc', label: '描述文案', kind: 'textarea' },
      { key: 'moreText', label: '「更多」链接文字', kind: 'text' },
      { key: 'moreLink', label: '「更多」链接地址', kind: 'text', placeholder: '如：/products' },
    ],
  },
  'ui-image': {
    label: '图片',
    group: ATOM_GROUP,
    component: markRaw(UiImage),
    layer: 'atom',
    accepts: [],
    defaultProps: () => ({ src: '', alt: '', ratio: 0, fit: 'cover', radius: 0 }),
    formSchema: [
      { key: 'src', label: '图片地址', kind: 'image' },
      { key: 'alt', label: '替代文字', kind: 'text' },
      { key: 'ratio', label: '宽高比（0 = 不设）', kind: 'number', tip: '填 1.777 表示 16:9' },
      { key: 'fit', label: '填充方式', kind: 'select', options: [
        { label: '裁切铺满', value: 'cover' }, { label: '完整显示', value: 'contain' }, { label: '拉伸', value: 'fill' },
      ] },
      { key: 'radius', label: '圆角 px（0 = 直角）', kind: 'number' },
    ],
  },
  'ui-button': {
    label: '按钮',
    group: ATOM_GROUP,
    component: markRaw(UiButton),
    layer: 'atom',
    accepts: [],
    defaultProps: () => ({ text: '查看详情', to: '/products', variant: 'solid' }),
    formSchema: [
      { key: 'text', label: '按钮文字', kind: 'text' },
      { key: 'to', label: '跳转地址', kind: 'text', tip: '站内路径 / 锚点 / mailto: / tel:' },
      { key: 'variant', label: '按钮形态', kind: 'select', options: [
        { label: '实心（主）', value: 'solid' }, { label: '描边（浅底）', value: 'ghost' }, { label: '反白（深底）', value: 'ghost-light' },
      ] },
    ],
  },
};

/** 区块库分组清单（管理端「新增区块」面板用） */
export const SECTION_GROUPS: string[] = ['头部与首屏', '图文内容', '数据驱动', '转化组件'];

/**
 * 首页九模块（D1）：顺序即官网自上而下的背景带顺序，与 pageDefaults.home 一一对应
 * 第 7 段 pm-entry 与第 9 段 cta-banner 的底色落在卡片上（form: 'card'），
 * 卡片自带 1px --ink-100 描边，因此与相邻通栏段之间本就有可见分界。
 */
export const HOME_MODULE_TYPES: string[] = [
  'hero', 'intro-eco', 'mvv', 'values', 'feature-products',
  'story', 'pm-entry', 'latest-news', 'cta-banner'
];

/** 列表内容来自公开接口的模块：不接受手工子内容（spec「插入到不允许的位置」） */
export const DATA_DRIVEN_TYPES = ['feature-products', 'latest-news', 'product-grid', 'news-feed', 'faq-list'];

export const REASON_DATA_DRIVEN = '该模块内容由数据接口驱动，不支持手工子内容';
export const REASON_TYPE_RETIRED = '该类型已下线，无法插入，建议删除此项';
export const REASON_SLOT_NOT_OPEN = '该模块首期未开放子内容位，当前只有首页模块可装载基础元素';

/** 组件库层级（未注册类型按 module 处理，由调用方先行判存在性） */
export function blockLayer(type: string): BlockLayer {
  return SECTION_REGISTRY[type]?.layer ?? 'module';
}

/**
 * 基础元素只接收注册表声明过的字段，避免多余 props 落到 DOM 属性上。
 * preview（编辑态）以组件自身是否声明该 prop 为准追加，注册表不再维护第二份清单；
 * 缺了它就等于把「图片未选择」「跳转地址不合法」两类编辑态提示丢在编辑器外面。
 */
export function atomBindProps(
  type: string,
  raw: Record<string, any> | undefined,
  preview?: boolean
): Record<string, any> {
  const meta = SECTION_REGISTRY[type];
  if (!meta) return {};
  const allowed = new Set(meta.formSchema.map((f) => f.key));
  const src = raw && typeof raw === 'object' ? raw : {};
  const binds: Record<string, any> = Object.fromEntries(Object.entries(src).filter(([key]) => allowed.has(key)));
  const declared = (meta.component as { props?: Record<string, unknown> }).props;
  if (preview && declared && 'preview' in declared) binds.preview = true;
  return binds;
}

/**
 * 某类型可装载的子内容层级
 * 只有显式声明 accepts 且组件版式里预留了子内容位（`<slot />`）的模块才放行；
 * 首期开放首页九模块中除两段数据驱动外的 7 个（hero / intro-eco / mvv / values / story / pm-entry / cta-banner）。
 */
export function blockAccepts(type: string): BlockLayer[] {
  return SECTION_REGISTRY[type]?.accepts ?? [];
}

/** 该类型能否装载目标层级的子内容 */
export function canAccept(type: string, childLayer: BlockLayer): boolean {
  return blockAccepts(type).includes(childLayer);
}

/** 不可用原因；返回 undefined 表示可插入 */
export function insertRejectReason(type: string, childLayer: BlockLayer): string | undefined {
  if (!SECTION_REGISTRY[type]) return REASON_TYPE_RETIRED;
  if (canAccept(type, childLayer)) return undefined;
  return DATA_DRIVEN_TYPES.includes(type) ? REASON_DATA_DRIVEN : REASON_SLOT_NOT_OPEN;
}

export function sectionLabel(type: string): string {
  return SECTION_REGISTRY[type]?.label || type;
}
