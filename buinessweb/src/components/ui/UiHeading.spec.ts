import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiHeading from './UiHeading.vue';

const mountHeading = (props: Record<string, any>) =>
  mount(UiHeading, {
    props,
    global: {
      stubs: { RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' } }
    }
  });

describe('UiHeading', () => {
  it('沿用 .sec-head 结构与类名，保证与改造前逐像素一致', () => {
    const wrapper = mountHeading({ eyebrow: '品牌介绍 · BRAND', title: ['聚焦你的多元', '存储你的<em>生活</em>'], desc: '描述' });
    expect(wrapper.classes()).toContain('sec-head');
    expect(wrapper.find('.eyebrow').text()).toBe('品牌介绍 · BRAND');
    expect(wrapper.findAll('h2 > span')).toHaveLength(2);
    expect(wrapper.findAll('h2 br')).toHaveLength(1);
  });

  it('主标题按行拆分：字符串单行、数组多行，末行不补换行', () => {
    const single = mountHeading({ title: '一行标题' });
    expect(single.findAll('h2 > span')).toHaveLength(1);
    expect(single.findAll('h2 br')).toHaveLength(0);

    const empty = mountHeading({ title: [] });
    expect(empty.findAll('h2 > span')).toHaveLength(0);
  });

  it('主标题保留高亮标签，描述按纯文本转义', () => {
    const wrapper = mountHeading({ title: ['<em>安心</em>存储'], desc: '<em>不该</em>高亮' });
    expect(wrapper.find('h2 em').exists()).toBe(true);
    expect(wrapper.find('.sec-head > p').text()).toBe('<em>不该</em>高亮');
  });

  it('dark 态与单行版式只加行内样式，不改变结构', () => {
    const dark = mountHeading({ title: ['T'], desc: 'D', dark: true });
    expect(dark.find('h2').attributes('style')).toContain('color');
    expect(dark.find('.sec-head > p').attributes('style')).toContain('rgba');

    const single = mountHeading({ title: ['T'], single: true });
    expect(single.find('.sec-head').attributes('style')).toContain('grid-template-columns: 1fr');
  });

  it('「更多」链接需要文字与地址同时具备', () => {
    expect(mountHeading({ moreText: '查看全部', moreLink: '/products' }).find('.sec-link').attributes('href')).toBe('/products');
    expect(mountHeading({ moreText: '查看全部' }).find('.sec-link').exists()).toBe(false);
    expect(mountHeading({ moreLink: '/products' }).find('.sec-link').exists()).toBe(false);
  });
});
