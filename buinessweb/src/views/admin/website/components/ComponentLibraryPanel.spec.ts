import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ComponentLibraryPanel from './ComponentLibraryPanel.vue';
import LibraryCard from './LibraryCard.vue';
import { HOME_MODULE_TYPES, SECTION_REGISTRY, sectionLabel } from '@/website/sectionRegistry';
import { BLOCK_LIMITS, type Block } from '@/website/blocks';

const ATOM_TYPES = Object.keys(SECTION_REGISTRY).filter((t) => SECTION_REGISTRY[t].layer === 'atom');

/** 预览样例带真实链接，卡片里的按钮会渲染 router-link；单测不装路由，用最小替身还原成 <a> */
const routerLinkStub = { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' };

/** 造一棵「顶层 n 个模块 + 第一个模块带 k 项子内容」的树 */
function tree(topModules: number, kidsOfFirst = 0): Block[] {
  const kids = Array.from({ length: kidsOfFirst }, (_, i) => ({
    id: `c-${i}`,
    type: 'ui-text',
    visible: true,
    props: {},
  }));
  return Array.from({ length: topModules }, (_, i) => ({
    id: `m-${i}`,
    type: i === 0 ? 'hero' : 'values',
    visible: true,
    props: {},
    ...(i === 0 && kids.length ? { children: kids } : {}),
  }));
}

const mountPanel = (opts: {
  blocks?: Block[];
  canWrite?: boolean;
  moduleTarget?: { index: number };
  atomTarget?: { parentId: string } | null;
  parentType?: string;
  parentLabel?: string;
}) =>
  mount(ComponentLibraryPanel, {
    props: {
      blocks: opts.blocks ?? tree(9),
      canWrite: opts.canWrite ?? true,
      moduleTarget: opts.moduleTarget ?? { index: 9 },
      atomTarget: opts.atomTarget ?? null,
      parentType: opts.parentType,
      parentLabel: opts.parentLabel,
    },
    global: { stubs: { RouterLink: routerLinkStub } },
  });

const cellByType = (wrapper: ReturnType<typeof mountPanel>, type: string) => {
  const cell = wrapper.findAll('.lib-cell').find((c) => c.find('.lib-type').text().endsWith(type));
  const reasonNode = cell?.find('.lib-reason');
  return {
    exists: !!cell,
    disabled: !!cell?.classes().includes('disabled'),
    reason: reasonNode?.exists() ? reasonNode.text() : '',
  };
};

describe('ComponentLibraryPanel：两层组件清单', () => {
  it('模块层列出九个首页模块与其余模块，基础元素层列出已注册元素', () => {
    const wrapper = mountPanel({});
    const segments = wrapper.findAll('.lib-seg-title');
    expect(segments).toHaveLength(2);
    expect(segments[0].text()).toContain('模块');
    expect(segments[1].text()).toContain('基础元素');
    for (const type of HOME_MODULE_TYPES) expect(cellByType(wrapper, type).exists).toBe(true);
    for (const type of ATOM_TYPES) expect(cellByType(wrapper, type).exists).toBe(true);
  });

  it('搜索同时过滤两层，无命中时给出空态', async () => {
    const wrapper = mountPanel({});
    await wrapper.find('input').setValue('按钮');
    const labels = wrapper.findAll('.lib-label').map((n) => n.text());
    expect(labels).toContain('按钮');
    expect(labels.some((l) => l.includes('首屏'))).toBe(false);

    await wrapper.find('input').setValue('不存在的组件');
    expect(wrapper.findAll('.lib-cell')).toHaveLength(0);
    expect(wrapper.find('.el-empty').exists()).toBe(true);
  });
});

describe('ComponentLibraryPanel：插入位置与权限约束', () => {
  it('选中可装载模块时基础元素可用，插入目标是该模块的子内容', async () => {
    const wrapper = mountPanel({ blocks: tree(9), atomTarget: { parentId: 'm-0' }, parentType: 'hero', parentLabel: '首页首屏 Hero' });
    expect(cellByType(wrapper, 'ui-button').disabled).toBe(false);
    expect(wrapper.find('.lib-target').text()).toContain('「首页首屏 Hero」的子内容末尾');
    const cell = wrapper.findAll('.lib-cell').find((c) => c.find('.lib-type').text().endsWith('ui-button'))!;
    await cell.trigger('click');
    const evt = wrapper.emitted('insert');
    expect(evt?.[0]?.[0]).toBe('ui-button');
    expect(evt?.[0]?.[1]).toEqual({ parentId: 'm-0' });
  });

  it('未选中模块时基础元素禁用并说明原因，模块项仍可用', () => {
    const wrapper = mountPanel({ blocks: tree(9), atomTarget: null });
    expect(cellByType(wrapper, 'ui-text')).toMatchObject({ disabled: true, reason: '请先在左侧选中一个可装载子内容的模块' });
    expect(cellByType(wrapper, 'hero').disabled).toBe(false);
  });

  it('数据驱动模块不接受手工子内容：基础元素禁用并给出原因', () => {
    const wrapper = mountPanel({ blocks: tree(9), atomTarget: { parentId: 'm-1' }, parentType: 'feature-products' });
    const atom = cellByType(wrapper, 'ui-image');
    expect(atom.disabled).toBe(true);
    expect(atom.reason).toContain('数据接口驱动');
  });

  it('首期未开放子内容位的模块给出对应原因', () => {
    const wrapper = mountPanel({ blocks: tree(9), atomTarget: { parentId: 'm-1' }, parentType: 'timeline' });
    expect(cellByType(wrapper, 'ui-text').reason).toContain('首期未开放子内容位');
  });

  it('只读账号可浏览组件库，但全部插入项禁用且点击不发出插入请求', async () => {
    const wrapper = mountPanel({ canWrite: false, atomTarget: { parentId: 'm-0' }, parentType: 'hero' });
    const cells = wrapper.findAll('.lib-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.classes().includes('disabled'))).toBe(true);
    expect(wrapper.find('.lib-reason').text()).toBe('当前账号只有内容查看权限');
    expect(wrapper.find('.el-alert').text()).toContain('只读模式');
    await cells[0].trigger('click');
    expect(wrapper.emitted('insert')).toBeUndefined();
  });
});

describe('ComponentLibraryPanel：数量与深度上限前置校验', () => {
  it('单页节点总数达到上限后插入项被拒绝并提示已达上限', () => {
    const blocks = tree(1, BLOCK_LIMITS.maxNodes - 1);
    const wrapper = mountPanel({ blocks, moduleTarget: { index: 1 }, atomTarget: { parentId: 'm-0' }, parentType: 'hero' });
    const cell = cellByType(wrapper, 'hero');
    expect(cell.disabled).toBe(true);
    expect(cell.reason).toContain(`单页节点数已达上限 ${BLOCK_LIMITS.maxNodes}`);
  });

  it('单模块子内容达到上限后基础元素项被拒绝', () => {
    const blocks = tree(1, BLOCK_LIMITS.maxChildren);
    const wrapper = mountPanel({ blocks, atomTarget: { parentId: 'm-0' }, parentType: 'hero' });
    const cell = cellByType(wrapper, 'ui-text');
    expect(cell.disabled).toBe(true);
    expect(cell.reason).toContain(`该模块子内容已达上限 ${BLOCK_LIMITS.maxChildren}`);
  });

  it('插入后会撑破深度上限的项被拒绝并给出超深提示', () => {
    const deep: Block[] = [
      {
        id: 'm-0', type: 'hero', visible: true, props: {},
        children: [
          { id: 'a1', type: 'ui-text', visible: true, props: {}, children: [
            { id: 'a2', type: 'ui-text', visible: true, props: {}, children: [
              { id: 'a3', type: 'ui-text', visible: true, props: {} },
            ] },
          ] },
        ],
      },
    ];
    const wrapper = mountPanel({ blocks: deep, atomTarget: { parentId: 'a3' }, parentType: 'hero' });
    const cell = cellByType(wrapper, 'ui-text');
    expect(cell.disabled).toBe(true);
    expect(cell.reason).toContain(`嵌套深度已达上限 ${BLOCK_LIMITS.maxDepth} 层`);
    // 页面顶层插入模块不受影响
    expect(cellByType(wrapper, 'values').disabled).toBe(false);
  });
});

describe('decoration-editor-toolkit：LibraryCard 可选 blocks prop（模板缩略真实渲染）', () => {
  /** jsdom 无 IntersectionObserver：桩成立即回调可视，让懒渲染立刻挂载预览 */
  const stubIO = () => {
    vi.stubGlobal('IntersectionObserver', class {
      private cb: (entries: { isIntersecting: boolean }[]) => void;
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { this.cb = cb; }
      observe() { this.cb([{ isIntersecting: true }]); }
      disconnect() {}
      unobserve() {}
    });
  };

  const mountCard = (opts: { blocks?: Block[]; type?: string; reason?: string }) =>
    mount(LibraryCard, {
      props: {
        item: { type: opts.type ?? 'hero', label: opts.blocks ? '自定义模板' : '组件库卡片', group: sectionLabel(opts.type ?? 'hero'), reason: opts.reason },
        ...(opts.blocks ? { blocks: opts.blocks } : {}),
      },
      global: { stubs: { RouterLink: routerLinkStub } },
      // 预览内容经 Teleport 落在 iframe 文档里，iframe 必须接入文档才拿得到 contentDocument
      attachTo: document.body,
    });

  /** 卡片预览的真实内容在隔离宿主的文档里，断言穿过 iframe 取，口径不放宽 */
  const stageOf = (wrapper: ReturnType<typeof mountCard>) => {
    const iframe = wrapper.find('iframe').element as HTMLIFrameElement;
    return iframe.contentDocument?.querySelector('.lib-stage') ?? null;
  };

  const settle = async (wrapper: ReturnType<typeof mountCard>) => {
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.vm.$nextTick();
  };

  it('传入自定义 Block 时渲染其自身内容，而不是类型默认骨架', async () => {
    stubIO();
    const wrapper = mountCard({ blocks: [{ id: 'tpl-1', type: 'hero', visible: true, props: { title: ['模板专属标题'] } }] });
    await settle(wrapper);
    expect(stageOf(wrapper)?.textContent).toContain('模板专属标题');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('不传 blocks 时回落类型内置样例（组件库调用方行为零变化）', async () => {
    stubIO();
    const wrapper = mountCard({});
    await settle(wrapper);
    const stage = stageOf(wrapper);
    expect(stage).not.toBeNull();
    expect(stage?.textContent).not.toContain('模板专属标题');
    expect(stage?.textContent).toContain('聚焦你的多元');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('卡片只渲染当前组件，不掺示例子内容', async () => {
    stubIO();
    const wrapper = mountCard({});
    await settle(wrapper);
    const doc = (wrapper.find('iframe').element as HTMLIFrameElement).contentDocument!;
    expect(doc.querySelectorAll('.section-renderer').length).toBe(1);
    expect(doc.querySelectorAll('section').length).toBe(1);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('带 reason 的卡片渲染禁用样式与原因（模板「类型已下线」复用同一通道）', () => {
    const wrapper = mountCard({ reason: '类型已下线' });
    expect(wrapper.find('.lib-cell').classes()).toContain('disabled');
    expect(wrapper.find('.lib-reason').text()).toBe('类型已下线');
  });
});
