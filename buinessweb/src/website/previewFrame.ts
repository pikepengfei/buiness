/**
 * 官网预览宿主：在同源 iframe 里复现官网的样式环境。
 *
 * 官网样式必须「原文注入 + 置于末位」：写进 <style scoped> 会先被 Vite 内联、再被 Vue
 * 追加 data-v，对子组件渲染出的区块一条都匹配不上（预览失真的根因）。
 * 复制宿主全部样式表而不是只注入官网样式，是因为官网与后台本就是同一个 SPA、
 * 共用同一份全局层叠环境；保持原顺序才能复现官网而不是近似官网。
 */
import websiteCss from '@/assets/website.css?raw';

export interface PreviewDevice {
  key: string;
  label: string;
  width: number;
}

/** 三档宽度分别落在官网断点（1100 / 860 / 640 / 480）之上、之间与之下 */
export const PREVIEW_DEVICES: PreviewDevice[] = [
  { key: 'desktop', label: '桌面', width: 1440 },
  { key: 'tablet', label: '平板', width: 834 },
  { key: 'phone', label: '手机', width: 390 },
];

export function deviceWidthOf(key: string): number {
  return (PREVIEW_DEVICES.find((d) => d.key === key) ?? PREVIEW_DEVICES[0]).width;
}

/** 适配倍率只影响显示大小，不参与断点判定（断点由 iframe 自身宽度决定） */
export function fitScale(available: number, deviceWidth: number): number {
  if (!(available > 0) || !(deviceWidth > 0)) return 1;
  return Math.min(1, available / deviceWidth);
}

type StyleSource = { kind: 'style'; text: string } | { kind: 'link'; html: string };

/** 预览自身的滚动条用官网品牌色，避免宿主文档里出现浏览器默认灰滚动条 */
const PREVIEW_CHROME_CSS = `
html { scrollbar-width: thin; scrollbar-color: #e0ae86 #f1ebe1; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #f1ebe1; }
::-webkit-scrollbar-thumb { background: #e0ae86; border: 2px solid #f1ebe1; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #de6420; }
`;

let cacheKey = '';
let cacheSources: StyleSource[] = [];

export function hostStyleSignature(): string {
  if (typeof document === 'undefined') return '';
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode as HTMLElement | null;
    if (!node) continue;
    if (node.tagName === 'STYLE') parts.push(`s${(node.textContent || '').length}`);
    else if (node.tagName === 'LINK') parts.push(`l${node.getAttribute('href') || ''}`);
  }
  return parts.join('|');
}

/** 按宿主样式表原顺序取源；同签名复用缓存，避免每次建宿主都重读几百 KB 文本 */
export function collectStyleSources(): StyleSource[] {
  if (typeof document === 'undefined') return [];
  const sig = hostStyleSignature();
  if (sig === cacheKey) return cacheSources;
  const sources: StyleSource[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode as HTMLElement | null;
    if (!node) continue;
    if (node.tagName === 'STYLE') {
      sources.push({ kind: 'style', text: node.textContent || '' });
    } else if (node.tagName === 'LINK') {
      sources.push({ kind: 'link', html: node.outerHTML });
    }
  }
  cacheKey = sig;
  cacheSources = sources;
  return sources;
}

export interface PreviewHost {
  doc: Document;
  /** 官网作用域根节点：预览内容 Teleport 到这里 */
  mount: HTMLElement;
  destroy(): void;
}

const hosts = new Set<PreviewHost>();
let headObserver: MutationObserver | undefined;
let syncScheduled = false;

function injectStyles(doc: Document): void {
  const head = doc.head;
  if (!head) return;
  head.querySelectorAll('[data-preview-style]').forEach((n) => n.remove());
  const frag = doc.createDocumentFragment();
  const append = (node: Element) => {
    node.setAttribute('data-preview-style', '');
    frag.appendChild(node);
  };
  for (const source of collectStyleSources()) {
    if (source.kind === 'style') {
      const el = doc.createElement('style');
      el.textContent = source.text;
      append(el);
    } else {
      const tpl = doc.createElement('template');
      tpl.innerHTML = source.html;
      const el = tpl.content.firstElementChild;
      if (el) append(el);
    }
  }
  const site = doc.createElement('style');
  site.textContent = websiteCss;
  append(site);
  const chrome = doc.createElement('style');
  chrome.textContent = PREVIEW_CHROME_CSS;
  append(chrome);
  head.appendChild(frag);
}

/** Element Plus 按需样式与 HMR 会在宿主建好之后才注入，增量镜像兜住这类时机 */
function scheduleSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    cacheKey = '';
    for (const host of hosts) injectStyles(host.doc);
  });
}

function ensureHeadObserver(): void {
  if (headObserver || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  headObserver = new MutationObserver(scheduleSync);
  headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
}

export function createPreviewHost(iframe: HTMLIFrameElement): PreviewHost {
  const doc = iframe.contentDocument;
  if (!doc) throw new Error('无法建立预览文档');
  doc.open();
  doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="/"></head><body></body></html>');
  doc.close();
  if (!doc.head || !doc.body) throw new Error('预览文档初始化失败');
  injectStyles(doc);

  const mount = doc.createElement('div');
  mount.className = 'site-root web-scope';
  doc.body.appendChild(mount);

  const host: PreviewHost = {
    doc,
    mount,
    destroy() {
      if (!hosts.delete(host)) return;
      doc.head?.querySelectorAll('[data-preview-style]').forEach((n) => n.remove());
      // 不动 mount 的子节点：那是 Vue Teleport 拥有的 DOM，由 Vue 自己移除
      if (!hosts.size) {
        headObserver?.disconnect();
        headObserver = undefined;
      }
    },
  };
  hosts.add(host);
  ensureHeadObserver();
  return host;
}

/** 供单测与调试观察存活宿主数（保活上限与释放幂等的判据） */
export function liveHostCount(): number {
  return hosts.size;
}