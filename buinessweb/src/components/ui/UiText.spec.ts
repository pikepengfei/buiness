import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiText from './UiText.vue';

describe('UiText', () => {
  it('text 分支只输出纯文本，标签被转义', () => {
    const wrapper = mount(UiText, { props: { text: '<img src=x onerror=alert(1)>' } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('<img src=x onerror=alert(1)>');
  });

  it('html 分支渲染可信标签，但不额外放宽：标签集合由后端清洗决定', () => {
    const wrapper = mount(UiText, { props: { html: '安全<strong>加粗</strong>与<br>换行' } });
    expect(wrapper.find('strong').text()).toBe('加粗');
    expect(wrapper.find('br').exists()).toBe(true);
    // 组件自身不注入任何事件属性
    expect(wrapper.html()).not.toContain('onclick');
  });

  it('text 与 html 同时给出时以 html 为准，避免混排', () => {
    const wrapper = mount(UiText, { props: { text: '纯文本', html: '<strong>富文本</strong>' } });
    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.text()).toBe('富文本');
  });

  it('内容为空时整段不渲染', () => {
    expect(mount(UiText, { props: { text: '' } }).find('p').exists()).toBe(false);
    expect(mount(UiText, { props: { text: '   ', html: '' } }).find('p').exists()).toBe(false);
  });

  it('inline 切换行内形态', () => {
    expect(mount(UiText, { props: { text: 'a' } }).element.tagName).toBe('P');
    expect(mount(UiText, { props: { text: 'a', inline: true } }).element.tagName).toBe('SPAN');
  });

  it('未指定 tone / size 时不输出变体类，模块原样式不被覆盖', () => {
    const plain = mount(UiText, { props: { text: 'a' } });
    expect(plain.classes()).toEqual(['ui-text']);

    const toned = mount(UiText, { props: { text: 'a', tone: 'muted', size: 'lg' } });
    expect(toned.classes()).toEqual(['ui-text', 'ui-text--muted', 'ui-text--lg']);
  });
});
