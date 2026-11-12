import { afterEach, describe, expect, it } from 'vitest';
import websiteCss from '@/assets/website.css?raw';
import {
  PREVIEW_DEVICES,
  collectStyleSources,
  createPreviewHost,
  deviceWidthOf,
  fitScale,
  hostStyleSignature,
  liveHostCount,
  type PreviewHost,
} from './previewFrame';

const created: PreviewHost[] = [];
let realStyleSheets: PropertyDescriptor | undefined;

/** happy-dom 的 CSSOM 不提供 ownerNode，用桩件验证「收集顺序」这段纯逻辑 */
function stubStyleSheets(nodes: Array<Record<string, unknown>>): void {
  realStyleSheets ??= Object.getOwnPropertyDescriptor(document, 'styleSheets');
  Object.defineProperty(document, 'styleSheets', {
    configurable: true,
    get: () => nodes.map((ownerNode) => ({ ownerNode })),
  });
}

function styleNode(text: string): Record<string, unknown> {
  return { tagName: 'STYLE', textContent: text };
}

function makeHost(): PreviewHost {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const host = createPreviewHost(iframe);
  created.push(host);
  return host;
}

afterEach(() => {
  while (created.length) created.pop()?.destroy();
  document.querySelectorAll('iframe').forEach((n) => n.remove());
  if (realStyleSheets) {
    Object.defineProperty(document, 'styleSheets', realStyleSheets);
    realStyleSheets = undefined;
  }
});

describe('设备视口与适配倍率', () => {
  it('三档宽度分别落在官网断点之上、之间与之下', () => {
    const [desktop, tablet, phone] = PREVIEW_DEVICES.map((d) => d.width);
    expect(desktop).toBeGreaterThan(1100);
    expect(tablet).toBeGreaterThan(640);
    expect(tablet).toBeLessThan(860);
    expect(phone).toBeLessThan(480);
  });

  it('未知设备回落桌面宽度', () => {
    expect(deviceWidthOf('watch')).toBe(PREVIEW_DEVICES[0].width);
    expect(deviceWidthOf('phone')).toBe(390);
  });

  it('倍率只按可用宽度适配，最大不超过 1，非法输入回落 1', () => {
    expect(fitScale(720, 1440)).toBeCloseTo(0.5);
    expect(fitScale(1600, 1440)).toBe(1);
    expect(fitScale(0, 1440)).toBe(1);
    expect(fitScale(720, 0)).toBe(1);
  });
});

describe('宿主样式收集', () => {
  it('保持宿主样式表原顺序，内联与外链都收', () => {
    stubStyleSheets([
      styleNode('.first{}'),
      { tagName: 'LINK', getAttribute: () => '/assets/app.css', outerHTML: '<link rel="stylesheet" href="/assets/app.css">' },
      styleNode('.third{}'),
    ]);
    const sources = collectStyleSources();
    expect(sources.map((s) => s.kind)).toEqual(['style', 'link', 'style']);
    expect((sources[0] as { text: string }).text).toBe('.first{}');
    expect((sources[2] as { text: string }).text).toBe('.third{}');
  });

  it('内容变化后签名变化并重新收集，未变化时复用缓存', () => {
    const node = styleNode('.cached-a{}');
    stubStyleSheets([node]);
    const before = hostStyleSignature();
    const first = collectStyleSources();
    expect(collectStyleSources()).toBe(first);
    node.textContent = '.cached-b-longer{}';
    expect(hostStyleSignature()).not.toBe(before);
    const second = collectStyleSources();
    expect(second).not.toBe(first);
    expect((second[0] as { text: string }).text).toBe('.cached-b-longer{}');
  });

  it('无 ownerNode 的样式表被跳过，不产生空注入', () => {
    stubStyleSheets([{ tagName: 'STYLE', textContent: '.orphan{}' }]);
    Object.defineProperty(document, 'styleSheets', {
      configurable: true,
      get: () => [{ ownerNode: null }, { ownerNode: styleNode('.kept{}') }],
    });
    const sources = collectStyleSources();
    expect(sources).toHaveLength(1);
    expect((sources[0] as { text: string }).text).toBe('.kept{}');
  });
});

describe('预览宿主文档', () => {
  it('建立同源文档：站点根 base 与官网作用域根节点', () => {
    const host = makeHost();
    expect(host.doc).not.toBe(document);
    expect(host.doc.querySelector('base')?.getAttribute('href')).toBe('/');
    expect(host.mount.className).toBe('site-root web-scope');
    expect(host.mount.parentElement).toBe(host.doc.body);
  });

  it('注入顺序 = 宿主样式原序 + 官网样式 + 预览自身滚动条样式', () => {
    stubStyleSheets([styleNode('.host-one{}'), styleNode('.host-two{}')]);
    const host = makeHost();
    const injected = Array.from(host.doc.head.querySelectorAll('[data-preview-style]'));
    expect(injected).toHaveLength(4);
    expect(injected[0].textContent).toBe('.host-one{}');
    expect(injected[1].textContent).toBe('.host-two{}');
    expect(injected[2].textContent).toBe(websiteCss);
    expect(injected[3].textContent).toContain('scrollbar');
  });

  it('释放后存活计数归零，重复释放幂等且清空注入', () => {
    const first = makeHost();
    const second = makeHost();
    expect(liveHostCount()).toBe(2);
    first.destroy();
    expect(liveHostCount()).toBe(1);
    first.destroy();
    expect(liveHostCount()).toBe(1);
    expect(first.doc.head.querySelectorAll('[data-preview-style]').length).toBe(0);
    second.destroy();
    expect(liveHostCount()).toBe(0);
  });
});