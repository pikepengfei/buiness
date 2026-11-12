import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiButton from './UiButton.vue';

// 仅测地址解析与三态类名，router-link 用最小替身还原成 <a href>
const mountButton = (props: Record<string, any>) =>
  mount(UiButton, {
    props,
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>'
        }
      }
    }
  });

describe('UiButton', () => {
  it('站内路径渲染为路由链接，三态各自对应一个变体类', () => {
    const solid = mountButton({ text: '了解产品', to: '/products', variant: 'solid' });
    expect(solid.classes()).toEqual(['ui-btn', 'ui-btn--solid']);
    expect(solid.attributes('href')).toBe('/products');
    expect(solid.text()).toBe('了解产品');

    expect(mountButton({ text: 'a', to: '/products', variant: 'ghost' }).classes()).toContain('ui-btn--ghost');
    expect(mountButton({ text: 'a', to: '/products', variant: 'ghost-light' }).classes()).toContain('ui-btn--ghost-light');
  });

  it('mailto: 与 tel: 走原生链接，不交给路由', () => {
    const mail = mountButton({ text: '写信', to: 'mailto:hi@centremix.cn', variant: 'solid' });
    expect(mail.element.tagName).toBe('A');
    expect(mail.attributes('href')).toBe('mailto:hi@centremix.cn');

    const tel = mountButton({ text: '致电', to: 'tel:4000000000' });
    expect(tel.attributes('href')).toBe('tel:4000000000');
  });

  it('页内锚点走原生链接', () => {
    const wrapper = mountButton({ text: '回顶部', to: '#top' });
    expect(wrapper.attributes('href')).toBe('#top');
  });

  it('站外绝对地址与协议相对地址判为非法：不产生跳转且带非法标记', () => {
    const external = mountButton({ text: '外链', to: 'https://evil.example.com/x' });
    expect(external.classes()).toContain('is-invalid');
    expect(external.attributes('href')).toBe('#');

    const protocolRelative = mountButton({ text: '外链', to: '//evil.example.com' });
    expect(protocolRelative.classes()).toContain('is-invalid');

    const js = mountButton({ text: 'x', to: 'javascript:alert(1)' });
    expect(js.classes()).toContain('is-invalid');
  });

  it('编辑态对非法地址给出校验提示，官网态不提示', () => {
    const preview = mountButton({ text: '外链', to: 'https://evil.example.com', preview: true });
    expect(preview.find('.ui-btn-warn').exists()).toBe(true);
    expect(preview.find('.ui-btn-warn').text()).toContain('站内路径');

    const live = mountButton({ text: '外链', to: 'https://evil.example.com', preview: false });
    expect(live.find('.ui-btn-warn').exists()).toBe(false);
  });

  it('无跳转地址时渲染为按钮并抛出 click', async () => {
    const wrapper = mountButton({ text: '搜索' });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('禁用态同时关闭交互', () => {
    const wrapper = mountButton({ text: '搜索', disabled: true });
    expect(wrapper.classes()).toContain('is-disabled');
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('允许用默认插槽替换文字内容', () => {
    const wrapper = mount(UiButton, {
      props: { to: '/products' },
      slots: { default: '<b>粗体</b>' },
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' } }
      }
    });
    expect(wrapper.find('b').exists()).toBe(true);
  });
});
