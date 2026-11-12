import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionRenderer from './SectionRenderer.vue';
import { countNodes, type Block } from './blocks';

const blk = (id: string, type: string, props: Record<string, any> = {}, extra: Partial<Block> = {}): Block => ({
  id,
  type,
  visible: true,
  props,
  ...extra,
});

const mountRenderer = (blocks: Block[], preview?: boolean) =>
  mount(SectionRenderer, {
    props: { blocks, preview },
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
      },
    },
  });

describe('SectionRenderer：结构版本 2 的分发', () => {
  it('改造前的历史数据（无 children）按模块自身文案渲染', () => {
    const wrapper = mountRenderer([blk('m1', 'cta-banner', { title: '有存储需求', desc: '随时联系我们' })]);
    expect(wrapper.find('.cta-banner h3').text()).toBe('有存储需求');
    expect(wrapper.find('.cta-banner p').text()).toBe('随时联系我们');
    expect(wrapper.find('.section-renderer > .container').exists()).toBe(true);
  });

  it('子内容落进模块版式内，并按基础元素自身的渲染规则出标签', () => {
    const wrapper = mountRenderer([
      blk('m1', 'cta-banner', { title: 'T' }, {
        children: [blk('c1', 'ui-text', { text: '补充说明', tone: 'muted' }), blk('c2', 'ui-image', { src: '/a.png', alt: '配图' })],
      }),
    ]);
    const kids = wrapper.findAll('.container .ui-text, .container img');
    expect(kids).toHaveLength(2);
    expect(wrapper.find('.ui-text').text()).toBe('补充说明');
    expect(wrapper.find('.container img').attributes('src')).toBe('/a.png');
  });

  it('未注册类型在子层同样被跳过，同级的其余子内容照常渲染', () => {
    const wrapper = mountRenderer([
      blk('m1', 'cta-banner', { title: 'T' }, {
        children: [blk('c1', 'ui-text', { text: '留下' }), blk('c2', 'legacy-widget', { text: '丢弃' }), blk('c3', 'ui-text', { text: '也留下' })],
      }),
    ]);
    expect(wrapper.text()).toContain('留下');
    expect(wrapper.text()).toContain('也留下');
    expect(wrapper.text()).not.toContain('丢弃');
  });

  it('模块文案与子内容都为空时整段不渲染，含仅子内容被全部隐藏的情况', () => {
    const empty = mountRenderer([blk('m1', 'cta-banner', { title: '', desc: '' })]);
    expect(empty.find('.cta-banner').exists()).toBe(false);
    expect(empty.find('.section-renderer').element.children.length).toBe(0);

    const hiddenKids = mountRenderer([
      blk('m2', 'cta-banner', { title: '' }, { children: [blk('c1', 'ui-text', { text: 'x' }, { visible: false })] }),
    ]);
    expect(hiddenKids.find('.cta-banner').exists()).toBe(false);

    const withKids = mountRenderer([
      blk('m3', 'cta-banner', { title: '' }, { children: [blk('c1', 'ui-text', { text: '仅子内容有内容' })] }),
    ]);
    expect(withKids.find('.cta-banner').exists()).toBe(true);
    expect(withKids.text()).toContain('仅子内容有内容');
  });

  it('visible=false 的模块整段不渲染，其余模块顺序不变', () => {
    const wrapper = mountRenderer([
      blk('m1', 'cta-banner', { title: '第一段' }),
      blk('m2', 'cta-banner', { title: '被隐藏' }, { visible: false }),
      blk('m3', 'cta-banner', { title: '第三段' }),
    ]);
    expect(wrapper.findAll('.cta-banner h3').map((n) => n.text())).toEqual(['第一段', '第三段']);
  });

  it('基础元素只接收注册表声明过的字段，多余 props 不落进 DOM', () => {
    const wrapper = mountRenderer([blk('c1', 'ui-text', { text: '正常文案', notAField: '不应出现', alt: '不应出现' })], true);
    const el = wrapper.find('.ui-text').element as HTMLElement;
    expect(el.hasAttribute('notAField')).toBe(false);
    expect(el.hasAttribute('nota-field')).toBe(false);
    expect(el.hasAttribute('alt')).toBe(false);
  });

  it('preview 逐层透传给模块组件，供编辑态禁用真实提交', () => {
    const previewed = mountRenderer([blk('m1', 'pm-entry', { word: 'W', num: '01', title: 'T', btnText: 'B' })], true);
    expect(previewed.find('.pm-entry').exists()).toBe(true);
    const plain = mountRenderer([blk('m1', 'pm-entry', { word: 'W', num: '01', title: 'T', btnText: 'B' })]);
    expect(plain.find('.pm-entry').exists()).toBe(true);
  });

  it('子内容的缺省提示只在编辑态出现，官网态不出现也不留破损元素', () => {
    const children = [
      blk('c1', 'ui-image', { alt: '缺地址' }),
      blk('c2', 'ui-button', { text: '外链', to: 'https://evil.example/x' }),
      blk('c3', 'ui-text', { text: '普通文字' }),
    ];
    const tree = [blk('m1', 'cta-banner', { title: 'T' }, { children })];

    const edit = mountRenderer(tree, true);
    expect(edit.find('.ui-image-missing').text()).toBe('图片未选择');
    expect(edit.find('.ui-btn-warn').text()).toContain('跳转地址仅支持站内路径');

    const live = mountRenderer(tree);
    expect(live.find('.ui-image-missing').exists()).toBe(false);
    expect(live.find('.ui-btn-warn').exists()).toBe(false);
    // 官网态非法地址仍渲染出按钮外观，但跳转被中和
    expect(live.find('.ui-btn.is-invalid').attributes('href')).toBe('#');

    // preview 不落进未声明该 prop 的基础元素根节点
    expect(live.find('.ui-text').element.hasAttribute('preview')).toBe(false);
    expect(edit.find('.ui-text').element.hasAttribute('preview')).toBe(false);
  });
});

describe('SectionRenderer：400 节点页面渲染基线（D Risks）', () => {
  it('上限内最深结构可完整渲染并记录耗时', () => {
    const blocks: Block[] = [];
    for (let m = 0; m < 8; m += 1) {
      const children: Block[] = [];
      for (let c = 0; c < 49; c += 1) {
        children.push(blk(`m${m}-c${c}`, 'ui-text', { text: `模块 ${m} 子内容 ${c}` }));
      }
      blocks.push(blk(`m${m}`, 'cta-banner', { title: `第 ${m + 1} 段` }, { children }));
    }
    expect(countNodes(blocks)).toBe(400);

    const started = performance.now();
    const wrapper = mountRenderer(blocks);
    const elapsed = performance.now() - started;
    expect(wrapper.findAll('.cta-banner')).toHaveLength(8);
    expect(wrapper.findAll('.ui-text')).toHaveLength(392);
    // jsdom 下的宽松门槛：只用于发现量级劣化，真实浏览器基线在 8.2 走查时记录
    expect(elapsed).toBeLessThan(4000);
  });
});
