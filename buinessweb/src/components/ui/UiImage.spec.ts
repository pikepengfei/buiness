import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiImage from './UiImage.vue';

describe('UiImage', () => {
  it('缺少地址时官网不渲染破损图片', () => {
    const wrapper = mount(UiImage, { props: { src: '', alt: 'x' } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('缺少地址时编辑态给出「图片未选择」提示', () => {
    const wrapper = mount(UiImage, { props: { src: '   ', preview: true } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.ui-image-missing').text()).toBe('图片未选择');
  });

  it('未指定可选项时不输出行内样式，交由所在模块的既有版式决定', () => {
    const wrapper = mount(UiImage, { props: { src: '/website/img/a.png', alt: '产品' } });
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('/website/img/a.png');
    expect(img.attributes('alt')).toBe('产品');
    expect(img.attributes('style')).toBeUndefined();
    // 改造前的首屏配图没有 loading 属性，默认不应输出该属性
    expect(img.attributes('loading')).toBeUndefined();
  });

  it('ratio / fit / radius 显式给出时才落到样式', () => {
    const wrapper = mount(UiImage, { props: { src: '/a.png', ratio: 16 / 9, fit: 'cover', radius: 14, lazy: true } });
    const style = wrapper.find('img').attributes('style') || '';
    expect(style).toContain('aspect-ratio');
    expect(style).toContain('object-fit: cover');
    expect(style).toContain('border-radius: 14px');
    expect(wrapper.find('img').attributes('loading')).toBe('lazy');
  });
});
