/**
 * 组件库预览的 demo Block 构造。
 * 内容优先取官网内置默认页里的真实区块（pageDefaults），预览看到的就是组件上线后的样子；
 * 类型清单仍以注册表为唯一来源：新增组件自动进库、类型下线自动消失。
 * demo 只用于预览渲染，绝不写入 pages 草稿。
 */
import type { Block } from './blocks';
import { DEFAULT_BLOCKS } from './pageDefaults';
import { SECTION_REGISTRY, canAccept } from './sectionRegistry';

/** 内置默认页里每个类型的第一份真实内容（模块级只读，构造时深拷贝） */
const PAGE_SAMPLES: Record<string, Record<string, unknown>> = {};
for (const blocks of Object.values(DEFAULT_BLOCKS)) {
  for (const block of blocks) {
    if (!PAGE_SAMPLES[block.type]) PAGE_SAMPLES[block.type] = block.props;
  }
}

/** 默认页没覆盖到的类型：给一份能看出版式的样例 */
const EXTRA_SAMPLES: Record<string, Record<string, unknown>> = {
  'rich-text': {
    eyebrow: '通用富文本 · RICH TEXT',
    title: ['任意富文本内容', '都能原样呈现'],
    desc: '支持小标题、列表、引用与链接，保存时后端自动清洗不安全标签。',
    theme: 'paper',
    html:
      '<h3>小标题</h3><p>正文段落支持<strong>加粗</strong>、<em>强调</em>与<a href="/products">站内链接</a>，' +
      '排版沿用官网设计系统的字号与行距。</p><ul><li>列表项一：原厂颗粒与数据安全</li>' +
      '<li>列表项二：3 年质保、只换不修</li></ul><blockquote>让每一次存储，都成为安心的承诺。</blockquote>',
  },
  'ui-heading': {
    eyebrow: '示例内容 · COMPONENT LIBRARY',
    title: ['模块内可装载基础元素'],
    desc: '这里展示子内容位在模块版式里的效果。',
    moreText: '了解更多 →',
    moreLink: '/products',
  },
  'ui-text': {
    text: '这段文字来自组件库示例，插入页面后可在中栏「内容编辑」里随时修改。',
    html: '',
    tone: 'body',
    size: 'md',
  },
  'ui-image': {
    src: '/website/img/prod/lifestyle-1.png',
    alt: 'Centremix 存储产品融入生活',
    ratio: 1.777,
    fit: 'cover',
    radius: 12,
  },
};

/** accepts=['atom'] 的模块塞两项示例子内容，让模块版式里的子内容位可见 */
const DEMO_ATOM_TYPES = ['ui-heading', 'ui-text'];

export interface LibraryDemoOptions {
  /** 默认塞示例子内容（卡片缩略要看子内容位）；单组件详情预览传 false，只渲染被点击的那个组件 */
  withDemoChildren?: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sampleProps(type: string): Record<string, unknown> {
  return PAGE_SAMPLES[type] ?? EXTRA_SAMPLES[type] ?? {};
}

/** 幂等：同一 type 每次调用得到结构相同的新对象（可安全用于渲染） */
export function libraryDemoBlocks(type: string, opts: LibraryDemoOptions = {}): Block[] {
  const meta = SECTION_REGISTRY[type];
  if (!meta) return [];
  const block: Block = {
    id: `lib-demo-${type}`,
    type,
    visible: true,
    props: { ...clone(meta.defaultProps()), ...clone(sampleProps(type)) },
  };
  if (opts.withDemoChildren !== false && canAccept(type, 'atom')) {
    block.children = DEMO_ATOM_TYPES.filter((atom) => SECTION_REGISTRY[atom]).map((atom, i) => ({
      id: `lib-demo-${type}-child-${i}`,
      type: atom,
      visible: true,
      props: { ...clone(SECTION_REGISTRY[atom].defaultProps()), ...clone(sampleProps(atom)) },
    }));
  }
  return [block];
}