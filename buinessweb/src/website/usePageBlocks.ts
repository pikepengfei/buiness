/**
 * 官网页面区块加载 composable
 * 默认渲染内置兜底 blocks（pageDefaults），挂载后拉取 CMS 正式内容覆盖；
 * 接口失败或内容为空时保持兜底，保证官网永不白屏。
 */
import { onMounted, ref } from 'vue';
import { cms } from '@/api/cms';
import { parseBlocks, type Block } from './blocks';
import { defaultBlocks } from './pageDefaults';

export function usePageBlocks(slug: string) {
  const blocks = ref<Block[]>(defaultBlocks(slug));
  const loaded = ref(false);

  onMounted(async () => {
    try {
      const page = await cms.getPage(slug);
      const remote = parseBlocks(page?.content_json);
      if (remote.length) blocks.value = remote;
      if (page) applyPageSeo(page);
    } catch {
      // 接口异常：保留内置默认内容
    } finally {
      loaded.value = true;
    }
  });

  return { blocks, loaded };
}

/** 管理端「页面信息」里的标题与 SEO 描述同步到浏览器标签与 meta[name=description] */
function applyPageSeo(page: { title?: string | null; meta_title?: string | null; meta_description?: string | null }) {
  const title = page.meta_title || page.title;
  if (title) document.title = title;
  if (!page.meta_description) return;
  let el = document.head.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'description');
    document.head.appendChild(el);
  }
  el.setAttribute('content', page.meta_description);
}
