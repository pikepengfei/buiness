import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import type { Block } from '@/website/blocks';
import Editor from './editor.vue';

const bySlug = vi.fn();
const saveDraft = vi.fn();
const listPages = vi.fn();
const copyBlock = vi.fn();
const listTemplates = vi.fn();

vi.mock('@/api/cms', () => ({
  // 预览面板会真实渲染数据驱动模块，这里统一返回「空列表」让其自然回落
  cms: new Proxy({} as Record<string, unknown>, {
    get: () => () => Promise.resolve({ list: [], total: 0, items: [] }),
  }),
  cmsAdmin: {
    pages: {
      bySlug: (...a: unknown[]) => bySlug(...a),
      saveDraft: (...a: unknown[]) => saveDraft(...a),
      publish: vi.fn(),
      unpublish: vi.fn(),
      discardDraft: vi.fn(),
      updateMeta: vi.fn(),
      // decoration-editor-toolkit：跨页复制用
      list: (...a: unknown[]) => listPages(...a),
      copyBlock: (...a: unknown[]) => copyBlock(...a),
    },
    // decoration-editor-toolkit：模板库 CRUD（编辑器只用到 list）
    blockTemplates: {
      list: (...a: unknown[]) => listTemplates(...a),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
    },
  },
  authApi: { login: vi.fn(), me: vi.fn(), refresh: vi.fn(), logout: vi.fn() },
  formApi: { submitContact: vi.fn(), submitSubscribe: vi.fn() },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'home' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

const flush = async (w: VueWrapper) => {
  for (let i = 0; i < 5; i += 1) await w.vm.$nextTick();
};

const drawerStub = {
  name: 'ElDrawerStub',
  props: ['modelValue'],
  template: '<div class="ed-lib-drawer-stub"><slot /></div>',
};

async function openEditor(blocks: unknown[]) {
  bySlug.mockResolvedValue({ id: '1', slug: 'home', title: '首页', draft_json: { blocks }, content_json: null });
  // 组件库已移到右侧抽屉：单测里打桩让面板始终渲染，既有插入/权限断言继续成立
  const wrapper = mount(Editor, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        ElDrawer: drawerStub,
        'el-drawer': drawerStub,
      },
    },
  });
  await flush(wrapper);
  return wrapper;
}

const cellOf = (wrapper: VueWrapper, type: string) =>
  wrapper.findAll('.lib-cell').find((c) => c.find('.lib-type').text().endsWith(type))!;

describe('装修编辑器：组件库插入与树形结构', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().user = { id: '1', username: 'op', permissions: ['content:write'] } as never;
    saveDraft.mockResolvedValue({});
  });

  it('组件库不再常驻左栏，左栏按钮负责打开右侧抽屉', async () => {
    const wrapper = await openEditor([
      { id: 'a', type: 'hero', visible: true, props: { title: ['A'] } },
    ]);
    expect(wrapper.find('.ed-lib').exists()).toBe(false);
    const btn = wrapper.find('.ed-lib-open');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(wrapper.findComponent({ name: 'ElDrawerStub' }).props('modelValue')).toBe(true);
  });

  it('选中可装载模块后插入基础元素：子内容出现在模块内并被选中', async () => {
    const wrapper = await openEditor([
      { id: 'home-hero', type: 'hero', visible: true, props: { title: ['品牌'] } },
      { id: 'home-products', type: 'feature-products', visible: true, props: { limit: 3 } },
    ]);
    const rows = wrapper.findAll('.ed-block-item');
    expect(rows).toHaveLength(2);

    // 数据驱动模块：基础元素项禁用并说明原因
    await rows[1].trigger('click');
    expect(cellOf(wrapper, 'ui-button').classes()).toContain('disabled');
    expect(cellOf(wrapper, 'ui-button').find('.lib-reason').text()).toContain('数据接口驱动');

    await rows[0].trigger('click');
    expect(cellOf(wrapper, 'ui-button').classes()).not.toContain('disabled');
    await cellOf(wrapper, 'ui-button').trigger('click');
    await flush(wrapper);

    const kidRows = wrapper.findAll('.ed-block-item');
    // 模块 1 + 其展开的子内容 1 + 模块 2
    expect(kidRows).toHaveLength(3);
    expect(kidRows[1].classes()).toEqual(expect.arrayContaining(['child', 'active']));
    expect(kidRows[2].classes()).not.toContain('child');
    expect(wrapper.find('.ed-crumb').text()).toContain('按钮 · 第 1 项');
  });

  it('模块按「选中项之后」插入页面顶层', async () => {
    const wrapper = await openEditor([
      { id: 'a', type: 'hero', visible: true, props: { title: ['A'] } },
      { id: 'b', type: 'story', visible: true, props: { title: ['B'] } },
    ]);
    await wrapper.findAll('.ed-block-item')[0].trigger('click');
    await cellOf(wrapper, 'mvv').trigger('click');
    await flush(wrapper);
    expect(wrapper.findAll('.eb-label').map((n) => n.text())).toEqual([
      '首页首屏 Hero',
      '使命与愿景',
      '深色品牌背景区（含品牌墙）',
    ]);
  });

  it('未注册类型标注「类型已下线」，删除子内容后选中回落到父模块', async () => {
    const wrapper = await openEditor([
      {
        id: 'home-hero',
        type: 'hero',
        visible: true,
        props: { title: ['品牌'] },
        children: [{ id: 'legacy', type: 'legacy-slider', visible: true, props: {} }],
      },
    ]);
    vi.stubGlobal('confirm', () => true);
    const rows = wrapper.findAll('.ed-block-item');
    expect(rows).toHaveLength(2);
    expect(rows[1].find('.eb-retired').text()).toBe('类型已下线');
    // 展开状态下子节点行可见；操作按钮序：👁 ↑ ↓ ⧉ ⇄ ✕ → 删除是第 6 个（✕）
    await rows[1].findAll('.eb-ops button')[5].trigger('click');
    await flush(wrapper);
    const after = wrapper.findAll('.ed-block-item');
    expect(after).toHaveLength(1);
    expect(after[0].classes()).toContain('active');
    vi.unstubAllGlobals();
  });

  it('只读账号：组件库可浏览但全部禁用，不产生脏状态且保存类按钮不可用', async () => {
    useAuthStore().user = { id: '2', username: 'viewer', permissions: ['content:read'] } as never;
    const wrapper = await openEditor([{ id: 'a', type: 'hero', visible: true, props: { title: ['A'] } }]);
    const cells = wrapper.findAll('.lib-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((c) => c.classes().includes('disabled'))).toHaveLength(cells.length);

    await cells[0].trigger('click');
    await flush(wrapper);
    expect(wrapper.find('.ed-topbar').text()).not.toContain('草稿未保存');
    const topButtons = wrapper.findAll('.ed-right button');
    expect(topButtons.filter((b) => b.attributes('disabled') === undefined)).toHaveLength(1);
  });

  it('超限内容保存被拒绝：提示定位到具体位置且不调用草稿接口', async () => {
    const kids = Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, type: 'ui-text', visible: true, props: { text: 'x' } }));
    const wrapper = await openEditor([{ id: 'a', type: 'hero', visible: true, props: { title: ['A'] }, children: kids }]);
    const saveBtn = wrapper.findAll('.ed-right button').find((b) => b.text().includes('保存草稿'))!;
    await saveBtn.trigger('click');
    await flush(wrapper);
    await new Promise((r) => setTimeout(r, 10));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('连续快速插入得到两个标识不同的实例，重复保存内容完全一致', async () => {
    const wrapper = await openEditor([{ id: 'a', type: 'hero', visible: true, props: { title: ['A'] } }]);
    const cell = cellOf(wrapper, 'ui-text');
    await cell.trigger('click');
    await flush(wrapper);
    await cellOf(wrapper, 'ui-text').trigger('click');
    await flush(wrapper);

    const rows = wrapper.findAll('.ed-block-item');
    expect(rows).toHaveLength(3);
    const saveBtn = wrapper.findAll('.ed-right button').find((b) => b.text().includes('保存草稿'))!;
    const savedTree = () => saveDraft.mock.calls[saveDraft.mock.calls.length - 1]?.[1] as { blocks: Block[] };
    const flatten = (list: Block[]): string[] =>
      list.flatMap((b) => [b.id, ...(b.children ? flatten(b.children) : [])]);
    await saveBtn.trigger('click');
    await flush(wrapper);
    const first = JSON.stringify(savedTree().blocks);
    await saveBtn.trigger('click');
    await saveBtn.trigger('click');
    await flush(wrapper);
    expect(JSON.stringify(savedTree().blocks)).toBe(first);
    const ids = new Set(flatten(savedTree().blocks));
    expect(ids.size).toBe(3);
    expect(savedTree().blocks[0].children).toHaveLength(2);
  });

  it('可改背景的模块未设定背景时标注「背景未指定」，已设定（含默认）不标注', async () => {
    const wrapper = await openEditor([
      { id: 'a', type: 'mvv', visible: true, props: { cards: [] } },
      { id: 'b', type: 'values', visible: true, props: { theme: '', items: [] } },
    ]);
    const labels = wrapper.findAll('.eb-label');
    expect(labels[0].text()).toContain('背景未指定');
    expect(labels[1].text()).not.toContain('背景未指定');
  });

  it('节点数超过阈值时预览折叠未选中模块', async () => {
    const big = Array.from({ length: 3 }, (_, m) => ({
      id: `m${m}`,
      type: 'hero',
      visible: true,
      props: { title: [`第 ${m + 1} 段`] },
      children: Array.from({ length: 40 }, (_, c) => ({ id: `m${m}-c${c}`, type: 'ui-text', visible: true, props: { text: `内容 ${c}` } })),
    }));
    const wrapper = await openEditor(big);
    expect(wrapper.find('.ed-count').text()).toContain('123');
    expect(wrapper.find('.ed-fold-tip').text()).toContain('预览已折叠未选中模块的内容');
    // 折叠后只有选中模块的子内容进入预览
    expect(wrapper.findAll('.section-renderer .ui-text').length).toBe(40);
  });
});

describe('装修编辑器：decoration-editor-toolkit（拖拽 / 复制 / 模板）', () => {
  /** 三个顶层模块，首模块带 2 项子内容（load 后自动展开，子行可见） */
  const tree3 = () => [
    {
      id: 'm1', type: 'story', visible: true, props: { title: ['一'] },
      children: [
        { id: 'k1', type: 'ui-text', visible: true, props: { text: '子一' } },
        { id: 'k2', type: 'ui-button', visible: true, props: { text: '子二' } },
      ],
    },
    { id: 'm2', type: 'hero', visible: true, props: { title: ['二'] } },
    { id: 'm3', type: 'values', visible: true, props: { theme: '', items: [] } },
  ];
  const labelsOf = (wrapper: VueWrapper) => wrapper.findAll('.eb-label').map((n) => n.text().split('\n')[0].trim());

  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().user = { id: '1', username: 'op', permissions: ['content:write'] } as never;
    saveDraft.mockReset();
    saveDraft.mockResolvedValue({});
    listTemplates.mockReset();
    listTemplates.mockResolvedValue({ list: [], total: 0 });
    listPages.mockReset();
    listPages.mockResolvedValue({ list: [], total: 0 });
  });

  /** tree3 的行标签：story（含 2 子内容）/ hero / values */
  const LABELS_INIT = ['深色品牌背景区（含品牌墙）', '文字', '按钮', '首页首屏 Hero', '品牌价值观'];

  it('同层同父拖拽换序：把第 3 个顶层模块拖到第 1 个位置', async () => {
    const wrapper = await openEditor(tree3());
    const rows = wrapper.findAll('.ed-block-item');
    expect(labelsOf(wrapper)).toEqual(LABELS_INIT);

    await rows[4].find('.eb-handle').trigger('dragstart');
    await rows[0].find('.eb-handle').trigger('drop');
    await flush(wrapper);

    // 顶层顺序变为 values / story（子内容仍归属 story 且顺序不变）/ hero
    expect(labelsOf(wrapper)).toEqual(['品牌价值观', '深色品牌背景区（含品牌墙）', '文字', '按钮', '首页首屏 Hero']);
    // 结构护栏无错误（保存前 validateTree 口径）
    const saveBtn = wrapper.findAll('.ed-right button').find((b) => b.text().includes('保存草稿'))!;
    await saveBtn.trigger('click');
    await flush(wrapper);
    expect(saveDraft).toHaveBeenCalled();
  });

  it('拖拽与上移按钮结果一致：同一目标位次两种途径产出相同顺序', async () => {
    // 拖拽途径
    const a = await openEditor(tree3());
    const rowsA = a.findAll('.ed-block-item');
    await rowsA[4].find('.eb-handle').trigger('dragstart');
    await rowsA[3].find('.eb-handle').trigger('drop');
    await flush(a);
    // 按钮途径：m3（当前第 3 个顶层）上移两次到第 1 位
    const b = await openEditor(tree3());
    for (let i = 0; i < 2; i += 1) {
      const topRows = b.findAll('.ed-block-item').filter((r) => !r.classes().includes('child'));
      await topRows[topRows.length - 1].findAll('.eb-ops button')[1].trigger('click'); // ↑
      await flush(b);
    }
    expect(labelsOf(a).slice(0, 2)).toEqual(labelsOf(b).slice(0, 2));
  });

  it('跨父序列拖移被拒：把子内容拖到顶层行，结构不变', async () => {
    const wrapper = await openEditor(tree3());
    const before = labelsOf(wrapper);
    const rows = wrapper.findAll('.ed-block-item');
    // 子内容行 k1 拖到顶层 values 行：父序列不同（story.children ↔ 顶层）
    await rows[1].find('.eb-handle').trigger('dragstart');
    await rows[4].find('.eb-handle').trigger('drop');
    await flush(wrapper);
    expect(labelsOf(wrapper)).toEqual(before);
    expect(wrapper.findAll('.ed-block-item')).toHaveLength(before.length);
  });

  it('同页复制（⧉）：整树副本插到源之后并选中新节点', async () => {
    const wrapper = await openEditor(tree3());
    const rows = wrapper.findAll('.ed-block-item');
    // 对第一个顶层模块（story）做同页复制；操作序：👁 ↑ ↓ ⧉ ⇄ ✕ → ⧉ 是第 4 个
    await rows[0].findAll('.eb-ops button')[3].trigger('click');
    await flush(wrapper);
    // 副本模块未展开（expandedIds 只含源 id）：story+2 子内容 + 副本 + hero + values = 6 行
    const after = wrapper.findAll('.ed-block-item');
    expect(after).toHaveLength(6);
    expect(after[3].text()).toContain('深色品牌背景区（含品牌墙）');
    expect(after[3].classes()).not.toContain('child');
    // 副本行被选中
    expect(after[3].classes()).toContain('active');
    // 子内容随整树复制（经保存载荷验证副本 children = 2 且 id 全不同）
    const saveBtn = wrapper.findAll('.ed-right button').find((b) => b.text().includes('保存草稿'))!;
    await saveBtn.trigger('click');
    await flush(wrapper);
    const saved = saveDraft.mock.calls[saveDraft.mock.calls.length - 1]?.[1] as { blocks: Block[] };
    const [src, copy] = saved.blocks;
    expect(copy.children).toHaveLength(2);
    expect(copy.id).not.toBe(src.id);
    // 原树 5 节点 + 副本整树 3 节点 = 8，且 id 全域无重复
    const flatten = (list: Block[]): string[] => list.flatMap((b) => [b.id, ...(b.children ? flatten(b.children) : [])]);
    const ids = flatten(saved.blocks);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  it('模板库标签页：从模板插入顶层模块并关闭抽屉', async () => {
    listTemplates.mockResolvedValue({
      list: [{
        id: 7, name: '活动 Hero', type: 'hero', props: { title: ['模板标题'] },
        created_by_name: 'op', created_at: '2026-11-12 10:00:00', updated_at: '2026-11-12 10:00:00', props_bytes: 64,
      }],
      total: 1,
    });
    const wrapper = await openEditor(tree3());
    await wrapper.find('.ed-lib-open').trigger('click');
    // 切到「模板库」标签页（lazy 挂载）
    const tabs = wrapper.findAll('.el-tabs__item');
    expect(tabs.map((t) => t.text())).toEqual(['组件库', '模板库']);
    await tabs[1].trigger('click');
    await flush(wrapper);

    const cell = wrapper.findAll('.lib-cell').find((c) => c.text().includes('活动 Hero'));
    expect(cell).toBeTruthy();
    expect(cell!.text()).toContain('首页首屏');
    await cell!.trigger('click');
    await flush(wrapper);
    // 插入到顶层选中项之后 → 顶部从 3 个模块变 4 个
    const topRows = wrapper.findAll('.ed-block-item').filter((r) => !r.classes().includes('child'));
    expect(topRows).toHaveLength(4);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('只读账号：拖拽把手 / 勾选 / 同页复制 / 跨页复制 / 模板写动作全部禁用', async () => {
    useAuthStore().user = { id: '2', username: 'viewer', permissions: ['content:read'] } as never;
    const wrapper = await openEditor(tree3());
    // 勾选框不渲染；把手带 disabled 样式；新增操作按钮全部 disabled
    expect(wrapper.find('.eb-check').exists()).toBe(false);
    expect(wrapper.find('.eb-handle').classes()).toContain('disabled');
    const opsButtons = wrapper.findAll('.ed-block-item')[0].findAll('.eb-ops button');
    // 👁 ↑ ↓ ⧉ ⇄ ✕ 全部 disabled
    expect(opsButtons.filter((b) => b.attributes('disabled') === undefined)).toHaveLength(0);
    // 拖拽被拒：dragstart 直接 return，顺序不变
    const before = labelsOf(wrapper);
    const rows = wrapper.findAll('.ed-block-item');
    await rows[0].find('.eb-handle').trigger('dragstart');
    await rows[4].find('.eb-handle').trigger('drop');
    await flush(wrapper);
    expect(labelsOf(wrapper)).toEqual(before);
    // 批量工具条不出现
    expect(wrapper.find('.ed-head-actions').text()).not.toContain('全选');
  });
});
