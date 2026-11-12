import { describe, expect, it } from 'vitest';
import { SECTION_REGISTRY } from './sectionRegistry';
import {
  BLOCK_LIMITS,
  CURRENT_BLOCK_SCHEMA_VERSION,
  checkInsert,
  collectIds,
  countNodes,
  duplicateTree,
  findNode,
  formatPath,
  hasNestedChildren,
  hasOwnContent,
  insertBlock,
  insertChild,
  isTemplateUsable,
  maxDepth,
  mergeBlockProps,
  moveChild,
  nestedSaveGuardMessage,
  parseBlocks,
  removeChild,
  RENDERER_SUPPORTED_SCHEMA_VERSION,
  trimByLimits,
  uniqueBlockId,
  validateTree,
  type Block
} from './blocks';

const node = (id: string, type: string, extra: Partial<Block> = {}): Block => ({
  id, type, visible: true, props: {}, ...extra
});

const LEGACY = {
  blocks: [
    { id: 'home-hero', type: 'hero', visible: true, props: { title: ['聚焦你的多元'] } },
    { id: 'home-products', type: 'feature-products', visible: true, props: { limit: 3 } }
  ]
};

describe('区块树：结构版本 2 的读取与迁移', () => {
  it('改造前的扁平数据（无 children）解析后内容与顺序不变', () => {
    const blocks = parseBlocks(LEGACY);
    expect(blocks.map((b) => b.id)).toEqual(['home-hero', 'home-products']);
    expect(blocks[0].props).toEqual({ title: ['聚焦你的多元'] });
    expect(blocks[0].children).toBeUndefined();
    expect(CURRENT_BLOCK_SCHEMA_VERSION).toBe(2);
  });

  it('重复执行迁移为恒等（二次读取不再变化）', () => {
    const once = parseBlocks(LEGACY);
    const twice = parseBlocks({ blocks: once });
    expect(twice).toEqual(once);
    expect(parseBlocks({ blocks: once })).toEqual(parseBlocks({ blocks: twice }));
  });

  it('空数组 children 归一为「缺省」，不往存储里塞空数组', () => {
    const [blk] = parseBlocks({ blocks: [{ ...LEGACY.blocks[0], children: [] }] });
    expect(blk.children).toBeUndefined();
  });

  it('逐层解析并迁移：子节点缺 visible / props 时补齐', () => {
    const blocks = parseBlocks({
      blocks: [{ id: 'story-1', type: 'story', props: { title: ['x'] }, children: [{ id: 'btn-1', type: 'ui-button', props: { text: '查看' } }] }]
    });
    const child = blocks[0].children![0];
    expect(child.visible).toBe(true);
    expect(child.props).toEqual({ text: '查看' });
  });

  it('子层里的非对象项被剔除，不产生空节点', () => {
    const blocks = parseBlocks({ blocks: [{ id: 'a', type: 'story', children: [null, { id: 'b', type: 'ui-image', props: {} }, 'x'] }] });
    expect(blocks[0].children?.map((c) => c.id)).toEqual(['b']);
  });

  it('历史 schemaVersion 标记在迁移后被剥离', () => {
    const blocks = parseBlocks({ blocks: [{ id: 'a', type: 'hero', schemaVersion: 1, props: { title: ['x'] } }] });
    expect((blocks[0] as any).schemaVersion).toBeUndefined();
  });
});

describe('区块树：计数、定位与结构操作', () => {
  const tree: Block[] = [
    node('m1', 'story', { props: { title: ['t'] }, children: [node('a1', 'ui-button'), node('a2', 'ui-text')] }),
    node('m2', 'mvv', { children: [node('a3', 'ui-image', { children: [node('a4', 'ui-text')] })] })
  ];

  it('节点总数含全部后代，深度顶层记为 1', () => {
    expect(countNodes(tree)).toBe(6);
    expect(maxDepth(tree)).toBe(3);
    expect(maxDepth([])).toBe(0);
  });

  it('按 id 定位返回从 1 开始的下标路径，并可格式化为提示语用的位置', () => {
    expect(findNode(tree, 'a4')?.path).toEqual([1, 0, 0]);
    expect(formatPath(findNode(tree, 'a4')!.path)).toBe('blocks.1.children.0.children.0');
    expect(formatPath([6])).toBe('blocks.6');
    expect(findNode(tree, 'nope')).toBeUndefined();
  });

  it('collectIds 覆盖全部层级', () => {
    expect(collectIds(tree).sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'm1', 'm2']);
  });

  it('子内容插入 / 删除 / 上下移都返回新树且不改原树', () => {
    const withNew = insertChild(tree, 'm1', node('a5', 'ui-button'), 1);
    expect(withNew[0].children?.map((c) => c.id)).toEqual(['a1', 'a5', 'a2']);
    expect(tree[0].children).toHaveLength(2);

    expect(removeChild(withNew, 'm1', 1)[0].children?.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(moveChild(withNew, 'm1', 0, 1)[0].children?.map((c) => c.id)).toEqual(['a5', 'a1', 'a2']);
    // 不存在的 parentId 不产生任何改动
    expect(removeChild(tree, 'ghost', 0)).toEqual(tree);
  });

  it('整树深拷贝重新生成标识，副本与源互不影响', () => {
    const original = new Set(collectIds(tree));
    const taken = new Set(original);
    const copy = duplicateTree(tree[0], taken);
    expect(copy.id).not.toBe('m1');
    expect(copy.children?.map((c) => c.type)).toEqual(['ui-button', 'ui-text']);
    // 副本的每个标识都不与页内既有节点冲突（taken 会随拷贝持续累积）
    expect([copy, ...copy.children!].every((c) => !original.has(c.id))).toBe(true);
    expect(new Set(collectIds([copy])).size).toBe(3);

    copy.props.title = ['改后'];
    copy.children![0].props.text = '改后';
    expect(tree[0].props.title).toEqual(['t']);
    expect(tree[0].children![0].props.text).toBeUndefined();
  });

  it('顶层插入按 index 生效', () => {
    expect(insertBlock(tree, 1, node('m3', 'values')).map((b) => b.id)).toEqual(['m1', 'm3', 'm2']);
  });
});

describe('decoration-editor-toolkit：同页复制与模板辅助函数', () => {
  // story 是可装载子内容的模块；3 项子内容来自任务 2.1 的覆盖口径
  const moduleWith3Kids = node('m9', 'story', {
    props: { title: ['模块'] },
    children: [node('k1', 'ui-button', { props: { text: '一' } }), node('k2', 'ui-text', { props: { text: '二' } }), node('k3', 'ui-image', { props: {} })],
  });

  it('带 3 项子内容的模块复制后：子内容数量一致、id 全不同、改副本不影响源', () => {
    const page = [moduleWith3Kids, node('m10', 'hero', { props: { title: ['尾部'] } })];
    const copy = duplicateTree(moduleWith3Kids, new Set(collectIds(page)));
    expect(copy.children).toHaveLength(3);
    expect(copy.children?.map((c) => c.type)).toEqual(['ui-button', 'ui-text', 'ui-image']);
    // 副本与源的所有节点 id 两两不同
    const srcIds = collectIds(page);
    const copyIds = collectIds([copy]);
    expect(copyIds.every((id) => !srcIds.includes(id))).toBe(true);
    expect(new Set(copyIds).size).toBe(4);

    copy.props.title = ['改'];
    copy.children![1].props.text = '改';
    expect(moduleWith3Kids.props.title).toEqual(['模块']);
    expect(moduleWith3Kids.children![1].props.text).toBe('二');
  });

  it('mergeBlockProps：以注册表默认值补齐旧模板缺字段，list/object 整体覆盖', () => {
    const merged = mergeBlockProps('hero', { title: ['自定义标题'] });
    // hero 默认骨架字段全部保留，模板里出现的字段覆盖默认
    expect(merged.title).toEqual(['自定义标题']);
    const defaults = SECTION_REGISTRY['hero'].defaultProps();
    for (const key of Object.keys(defaults)) {
      if (key !== 'title') expect(merged).toHaveProperty(key);
    }
    // list 整体覆盖：不与默认条目合并
    const two = mergeBlockProps('hero', { title: ['一', '二'] });
    expect(two.title).toEqual(['一', '二']);
  });

  it('mergeBlockProps：未知类型返回空对象（调用方标「类型已下线」）', () => {
    expect(mergeBlockProps('legacy-slider', { title: ['x'] })).toEqual({});
  });

  it('isTemplateUsable：注册表内的模块与基础元素都可用，未注册类型不可用', () => {
    expect(isTemplateUsable('hero')).toBe(true);
    expect(isTemplateUsable('story')).toBe(true);
    expect(isTemplateUsable('ui-button')).toBe(true);
    expect(isTemplateUsable('legacy-slider')).toBe(false);
  });

  it('模板插入流程（merge → unique id → checkInsert）不产生重复 id 且可过护栏', () => {
    const tplProps = { title: ['模板标题'] };
    const page = [moduleWith3Kids];
    const node: Block = {
      id: uniqueBlockId('hero', collectIds(page)),
      type: 'hero',
      visible: true,
      props: mergeBlockProps('hero', tplProps),
    };
    expect(collectIds(page)).not.toContain(node.id);
    expect(checkInsert(page, node, { index: page.length })).toBeUndefined();
    const next = insertBlock(page, page.length, node);
    expect(validateTree(next)).toEqual([]);
  });

  it('接近节点上限时整树复制被拒：单节点插入仍可', () => {
    // 199 个顶层模块（≤ topBlocks 200）；首模块 3 节点、其余各 2 节点 = 399 = maxNodes - 1
    const near: Block[] = Array.from({ length: 199 }, (_, i) =>
      node(`nm${i}`, 'story', {
        children: i === 0
          ? [node('na0', 'ui-text'), node('na0b', 'ui-text')]
          : [node(`na${i}`, 'ui-text')],
      })
    );
    expect(countNodes(near)).toBe(BLOCK_LIMITS.maxNodes - 1);
    expect(checkInsert(near, node('one', 'values'), { index: 0 })).toBeUndefined();
    const copy = duplicateTree(near[0], new Set(collectIds(near)));
    expect(checkInsert(near, copy, { index: 0 })).toContain(`单页节点数已达上限 ${BLOCK_LIMITS.maxNodes}`);
  });
});

describe('区块树：上限校验与裁剪', () => {
  const deepTree = (levels: number): Block[] => {
    const leaf = node('leaf', 'ui-text');
    let current = [leaf];
    for (let i = 0; i < levels - 1; i += 1) current = [node(`m${i}`, 'story', { children: current })];
    return current;
  };

  it('深度上限 4：第 5 层被拒且位置可定位', () => {
    expect(BLOCK_LIMITS).toEqual({ maxDepth: 4, maxNodes: 400, maxChildren: 50 });
    expect(maxDepth(deepTree(4))).toBe(4);
    expect(maxDepth(deepTree(5))).toBe(5);
    expect(validateTree(deepTree(5))).toContain(
      'blocks.0.children.0.children.0.children.0.children.0：嵌套深度超过 4 层'
    );
    expect(validateTree(deepTree(4))).toEqual([]);
  });

  it('插入试算按真实位置判定：撑破任一上限即拒绝并说明上限', () => {
    const target = deepTree(4);
    // 挂在第 4 层的叶子下会变成第 5 层
    expect(checkInsert(target, node('new', 'ui-text'), { parentId: 'leaf', index: 0 }))
      .toBe('嵌套深度已达上限 4 层（插入后为 5 层）');
    // 挂在第 3 层的模块下仍是 4 层，放行
    expect(checkInsert(target, node('new', 'ui-text'), { parentId: 'm2', index: 0 })).toBeUndefined();
    // 单模块子内容数超限
    const full = node('m', 'story', {
      children: Array.from({ length: BLOCK_LIMITS.maxChildren }, (_, i) => node(`k${i}`, 'ui-text'))
    });
    expect(checkInsert([full], node('new', 'ui-text'), { parentId: 'm' }))
      .toBe('该模块子内容已达上限 50 项（插入后为 51 项）');
    // 单页节点总数超限
    const many = Array.from({ length: BLOCK_LIMITS.maxNodes }, (_, i) => node(`n${i}`, 'hero'));
    expect(checkInsert(many, node('new', 'hero'))).toBe('单页节点数已达上限 400 个（插入后为 401 个）');
  });

  it('单模块子内容与单页节点总数上限', () => {
    const kids = Array.from({ length: BLOCK_LIMITS.maxChildren + 1 }, (_, i) => node(`k${i}`, 'ui-text'));
    expect(validateTree([node('m', 'story', { children: kids })])).toContain('blocks.0：子内容超过 50 项');

    const many = Array.from({ length: BLOCK_LIMITS.maxNodes + 1 }, (_, i) => node(`n${i}`, 'hero'));
    expect(validateTree(many)).toContain(`单页节点数 401 超过上限 400`);
  });

  it('节点标识重复被检出', () => {
    expect(validateTree([node('dup', 'hero'), node('dup', 'mvv')])).toContain('blocks.1：节点标识重复（dup）');
  });

  it('裁剪把超深子内容去掉并报告位置，保留模块自身内容', () => {
    const { blocks, removed } = trimByLimits(deepTree(6));
    expect(maxDepth(blocks)).toBe(4);
    expect(removed.some((r) => r.includes('嵌套超过 4 层'))).toBe(true);
    expect(blocks[0].props).toBeDefined();
  });

  it('裁剪超限子内容数量', () => {
    const kids = Array.from({ length: 60 }, (_, i) => node(`k${i}`, 'ui-text'));
    const { blocks, removed } = trimByLimits([node('m', 'story', { children: kids })]);
    expect(blocks[0].children).toHaveLength(BLOCK_LIMITS.maxChildren);
    expect(removed.join(' ')).toContain('子内容超出 50 项');
  });
});

describe('区块树：D5 部署护栏（渲染器读不懂嵌套结构时拒绝保存）', () => {
  const nested = [node('m1', 'story', { children: [node('c1', 'ui-text', { props: { text: 'x' } })] })];
  const flat = [node('m1', 'story'), node('m2', 'values')];

  it('当前渲染器版本允许保存嵌套内容', () => {
    expect(RENDERER_SUPPORTED_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    expect(nestedSaveGuardMessage(nested)).toBeUndefined();
  });

  it('渲染器版本低于 2 时，带 children 的内容给出拒绝原因，纯历史结构不受影响', () => {
    const msg = nestedSaveGuardMessage(nested, 1);
    expect(msg).toContain('结构版本 1');
    expect(msg).toContain('模块内的子内容无法显示');
    expect(nestedSaveGuardMessage(flat, 1)).toBeUndefined();
  });

  it('hasNestedChildren 覆盖任意层级，空数组不算嵌套', () => {
    expect(hasNestedChildren(flat)).toBe(false);
    expect(hasNestedChildren(nested)).toBe(true);
    expect(hasNestedChildren([node('m1', 'story', { children: [] })])).toBe(false);
    const deep = [node('m1', 'story', { children: [node('c1', 'ui-text', { children: [node('g1', 'ui-button')] })] })];
    expect(hasNestedChildren(deep)).toBe(true);
  });
});

describe('区块树：空内容判定（模块内容为空则整段不渲染）', () => {
  it('文案为空且无子内容判为空', () => {
    expect(hasOwnContent(node('a', 'hero', { props: { title: [''], desc: '   ', cta1: { text: '', link: '' } } }))).toBe(false);
    expect(hasOwnContent(node('b', 'hero', { props: {} }))).toBe(false);
  });

  it('有文案或有数值参数都不判为空', () => {
    expect(hasOwnContent(node('c', 'hero', { props: { title: ['有内容'] } }))).toBe(true);
    // 数据驱动模块的区头可以全空，但 limit / pageSize 这类数值参数说明它仍有列表
    expect(hasOwnContent(node('f', 'feature-products', { props: { limit: 3 } }))).toBe(true);
  });

  it('布尔 false 不算内容，true 算（避免开关字段把空模块撑住）', () => {
    expect(hasOwnContent(node('g', 'hero', { props: { theme: false } }))).toBe(false);
    expect(hasOwnContent(node('h', 'hero', { props: { theme: true } }))).toBe(true);
  });
});
