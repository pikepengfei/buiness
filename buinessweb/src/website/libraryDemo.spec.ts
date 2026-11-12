import { describe, expect, it } from 'vitest';
import { libraryDemoBlocks } from './libraryDemo';
import { validateTree } from './blocks';
import { DATA_DRIVEN_TYPES, SECTION_REGISTRY } from './sectionRegistry';
import {
  DEMO_ARTICLES,
  DEMO_ARTICLE_CATEGORIES,
  DEMO_FAQS,
  DEMO_PRODUCTS,
  DEMO_PRODUCT_CATEGORIES,
} from './libraryDemoData';

describe('libraryDemoBlocks：组件库预览的 demo 内容', () => {
  it('构造幂等，同类型两次调用结构完全一致', () => {
    expect(libraryDemoBlocks('hero')).toEqual(libraryDemoBlocks('hero'));
  });

  it('未注册类型返回空清单（类型下线后自动从库中消失）', () => {
    expect(libraryDemoBlocks('retired-widget')).toEqual([]);
  });

  it('注册表新增类型无需额外配置即可构造出预览', () => {
    for (const type of Object.keys(SECTION_REGISTRY)) {
      expect(libraryDemoBlocks(type)).toHaveLength(1);
    }
  });

  it('开放子内容位的模块带示例子内容，且结构过 validateTree', () => {
    const [hero] = libraryDemoBlocks('hero');
    expect(hero.children?.length).toBeGreaterThan(0);
    expect(hero.children?.every((c) => SECTION_REGISTRY[c.type]?.layer === 'atom')).toBe(true);
    expect(validateTree([hero])).toEqual([]);
  });

  it('数据驱动模块不塞示例子内容', () => {
    for (const type of DATA_DRIVEN_TYPES) {
      expect(libraryDemoBlocks(type)[0].children).toBeUndefined();
    }
  });

  it('withDemoChildren=false 时只构造被点击的组件本身（详情预览不掺别的组件）', () => {
    for (const type of Object.keys(SECTION_REGISTRY)) {
      const [block] = libraryDemoBlocks(type, { withDemoChildren: false });
      expect(block.children).toBeUndefined();
      expect(block.type).toBe(type);
    }
    const [hero] = libraryDemoBlocks('hero', { withDemoChildren: false });
    expect(validateTree([hero])).toEqual([]);
    expect(libraryDemoBlocks('hero', { withDemoChildren: false })).toEqual(
      libraryDemoBlocks('hero', { withDemoChildren: false })
    );
  });

  it('不传选项时保持卡片缩略口径：开放子内容位的模块仍带示例子内容', () => {
    expect(libraryDemoBlocks('hero')[0].children?.length).toBeGreaterThan(0);
    expect(libraryDemoBlocks('hero', {})[0].children?.length).toBeGreaterThan(0);
  });
});

describe('libraryDemoData：占位样例字段完整', () => {
  it('产品 / 资讯 / FAQ / 分类样例均可用于数据驱动区块渲染', () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThan(0);
    expect(DEMO_PRODUCTS.every((p) => p.slug && p.name && 'cover_image' in p)).toBe(true);
    expect(DEMO_ARTICLES.every((a) => a.slug && a.title && a.published_at)).toBe(true);
    expect(DEMO_FAQS.every((f) => f.question && f.answer && f.category)).toBe(true);
    expect(DEMO_PRODUCT_CATEGORIES.every((c) => c.slug && c.name)).toBe(true);
    expect(DEMO_ARTICLE_CATEGORIES.every((c) => c.slug && c.name)).toBe(true);
  });
});
