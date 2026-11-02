<script lang="ts" setup>
/**
 * 官网壳层：顶栏导航 / CTA / 页脚分组全部由 menus 表（location=header|cta|footer）驱动
 * 仅在站点配置拉取失败时退落到与建站种子一致的内置文案
 */
import { computed, onMounted, ref } from 'vue';
import { useSiteStore } from '@/stores/site';
import type { MenuItem } from '@/types/cms';

const site = useSiteStore();
const mobileOpen = ref(false);

onMounted(() => site.ensureLoaded());
const closeMobile = () => (mobileOpen.value = false);

// 兜底导航（站点配置未加载时使用）
const fallbackMenus: MenuItem[] = [
  { id: 1, parent_id: null, title: '首页', url: '/', target: '_self', location: 'header', sort: 1, status: 1 },
  { id: 2, parent_id: null, title: '关于我们', url: '/about', target: '_self', location: 'header', sort: 2, status: 1 },
  { id: 3, parent_id: null, title: '产品中心', url: '/products', target: '_self', location: 'header', sort: 3, status: 1 },
  { id: 4, parent_id: null, title: '新闻资讯', url: '/news', target: '_self', location: 'header', sort: 4, status: 1 },
  { id: 5, parent_id: null, title: '联系我们', url: '/contact', target: '_self', location: 'header', sort: 5, status: 1 },
];
const fallbackFooter: MenuItem[] = [
  { id: 101, parent_id: null, title: '公司介绍', url: null, target: '_self', location: 'footer', sort: 1, status: 1, children: [
    { id: 102, parent_id: 101, title: '品牌故事', url: '/about', target: '_self', location: 'footer', sort: 1, status: 1 },
    { id: 103, parent_id: 101, title: '品牌理念', url: '/about', target: '_self', location: 'footer', sort: 2, status: 1 },
    { id: 104, parent_id: 101, title: '公司背书', url: '/about', target: '_self', location: 'footer', sort: 3, status: 1 },
    { id: 105, parent_id: 101, title: '新闻资讯', url: '/news', target: '_self', location: 'footer', sort: 4, status: 1 },
  ] },
  { id: 111, parent_id: null, title: '产品与服务', url: null, target: '_self', location: 'footer', sort: 2, status: 1, children: [
    { id: 112, parent_id: 111, title: '产品中心', url: '/products', target: '_self', location: 'footer', sort: 1, status: 1 },
    { id: 113, parent_id: 111, title: '产品详情', url: '/products', target: '_self', location: 'footer', sort: 2, status: 1 },
    { id: 114, parent_id: 111, title: '售后服务', url: '/contact', target: '_self', location: 'footer', sort: 3, status: 1 },
    { id: 115, parent_id: 111, title: '站内搜索', url: '/search', target: '_self', location: 'footer', sort: 4, status: 1 },
  ] },
];

const headerMenus = computed(() => (site.menus.length ? site.menus : fallbackMenus));
const ctaMenu = computed(() => site.ctaMenu ?? null);
const footerCols = computed(() => (site.footerMenus.length ? site.footerMenus : fallbackFooter));
// 「联系我们」列由站点设置渲染，固定排在菜单分组之后，因此列数 = 分组数 + 1
const footGridStyle = computed(() => ({ gridTemplateColumns: `1.35fr repeat(${footerCols.value.length + 1}, 1fr)` }));

/** 顶级项 url 为空的是页脚列标题，本身不可点击 */
const isLink = (m: MenuItem) => !!m.url;
/** 外链或要求新窗口时用原生 a，交给浏览器处理 */
const isExternal = (m: MenuItem) => m.target === '_blank' || /^(https?:)?\/\/|^(mailto|tel):/i.test(m.url || '');
const sub = (m: MenuItem) => (m.children || []).filter((c) => c.status !== 0);
/**
 * 「首页」指向 Layout 父路由 '/' 下的空 path 子路由，两条记录的 path 都是 '/'。
 * vue-router 的 isActive 对这种子路由会回退比对父记录，而父记录出现在每一个页面的 matched 里，
 * 于是 首页 在任何页面都被判为激活（与其他 tab 同时高亮）——只有精确匹配能避开这条回退。
 */
const isHomeLink = (m: MenuItem) => (m.url || '/').split(/[?#]/)[0].replace(/\/+$/, '') === '';
</script>

<template>
  <div class="site-root web-scope">
    <!-- ===================== NAV ===================== -->
    <header class="topbar">
      <div class="container topbar-inner">
        <router-link class="brand" to="/">
          <img :src="site.logoUrl" :alt="site.siteName" />
        </router-link>
        <nav class="nav">
          <div v-for="m in headerMenus" :key="m.id" class="nav-item" :class="{ 'has-sub': sub(m).length > 0 }">
            <component
              :is="isExternal(m) ? 'a' : 'RouterLink'"
              v-bind="isExternal(m) ? { href: m.url, target: m.target === '_blank' ? '_blank' : undefined, rel: 'noopener noreferrer' } : { to: m.url }"
              :active-class="isHomeLink(m) ? '' : 'active'"
              :exact-active-class="isHomeLink(m) ? 'active' : undefined"
            >{{ m.title }}</component>
            <div v-if="sub(m).length" class="nav-sub">
              <component
                :is="isExternal(c) ? 'a' : 'RouterLink'"
                v-for="c in sub(m)"
                :key="c.id"
                v-bind="isExternal(c) ? { href: c.url, target: c.target === '_blank' ? '_blank' : undefined, rel: 'noopener noreferrer' } : { to: c.url }"
                class="nav-sublink"
                active-class="active"
              >{{ c.title }}</component>
            </div>
          </div>
        </nav>
        <component
          :is="ctaMenu && isExternal(ctaMenu) ? 'a' : 'RouterLink'"
          v-if="ctaMenu"
          v-bind="ctaMenu && isExternal(ctaMenu) ? { href: ctaMenu.url, rel: 'noopener noreferrer' } : { to: ctaMenu?.url }"
          class="nav-cta"
          active-class="active"
        >{{ ctaMenu.title }} <span class="arrow">→</span></component>
        <button class="nav-burger" aria-label="打开菜单" @click="mobileOpen = !mobileOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <!-- 移动端导航 -->
    <div class="mnav" :class="{ open: mobileOpen }">
      <template v-for="m in headerMenus" :key="m.id">
        <component
          :is="isExternal(m) ? 'a' : 'RouterLink'"
          v-bind="isExternal(m) ? { href: m.url, target: m.target === '_blank' ? '_blank' : undefined, rel: 'noopener noreferrer' } : { to: m.url }"
          :active-class="isHomeLink(m) ? '' : 'active'"
          :exact-active-class="isHomeLink(m) ? 'active' : undefined"
          @click="closeMobile"
        >{{ m.title }}</component>
        <component
          :is="isExternal(c) ? 'a' : 'RouterLink'"
          v-for="c in sub(m)"
          :key="c.id"
          v-bind="isExternal(c) ? { href: c.url, target: c.target === '_blank' ? '_blank' : undefined, rel: 'noopener noreferrer' } : { to: c.url }"
          class="mnav-sub"
          active-class="active"
          @click="closeMobile"
        >{{ c.title }}</component>
      </template>
      <component
        :is="ctaMenu && isExternal(ctaMenu) ? 'a' : 'RouterLink'"
        v-if="ctaMenu"
        v-bind="ctaMenu && isExternal(ctaMenu) ? { href: ctaMenu.url, rel: 'noopener noreferrer' } : { to: ctaMenu?.url }"
        class="mnav-cta"
        @click="closeMobile"
      >{{ ctaMenu.title }} <span class="arrow">→</span></component>
    </div>

    <!-- ===================== 页面内容 ===================== -->
    <main class="site-main">
      <router-view />
    </main>

    <!-- ===================== FOOTER ===================== -->
    <footer>
      <div class="container foot-grid" :style="footGridStyle">
        <div class="foot-brand">
          <img src="/website/img/logo-white.png" alt="Centremix 芯联创" />
          <p>Centremix 芯联创 —— 2022 年与希捷工厂深度合作创立的自营存储品牌，以「便捷存储」为核心，为国人带来兼具高品质与高性价比的存储类产品。</p>
          <div class="foot-slogan"><span class="c-arc thin white"></span> {{ site.slogan || '聚焦你的多元，存储你的生活' }}</div>
        </div>
        <div v-for="col in footerCols" :key="col.id" class="foot-col">
          <h5>{{ col.title }}</h5>
          <template v-for="c in sub(col)" :key="c.id">
            <component
              :is="isExternal(c) ? 'a' : 'RouterLink'"
              v-bind="isExternal(c) ? { href: c.url, target: c.target === '_blank' ? '_blank' : undefined, rel: 'noopener noreferrer' } : { to: c.url }"
            >{{ c.title }}</component>
          </template>
        </div>
        <div class="foot-col">
          <h5>联系我们</h5>
          <a v-if="site.contactEmail" :href="`mailto:${site.contactEmail}`">{{ site.contactEmail }}</a>
          <a v-if="site.contactPhone" :href="`tel:${site.contactPhone.replace(/-/g, '')}`">{{ site.contactPhone }}</a>
          <span style="display: block">{{ site.address || '北京市海淀区' }}</span>
        </div>
      </div>
      <div class="container foot-bottom">
        <span>© 2026 {{ site.companyName || '北京展创振华科技有限公司' }} · Centremix 芯联创. All Rights Reserved.</span>
        <span>{{ site.icp || '京 ICP 备 XXXXXXXX 号' }} · 数据守护者</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site-root { min-height: 100vh; display: flex; flex-direction: column; }
.site-main { flex: 1 0 auto; }

/* 顶栏下拉：hover / 键盘聚焦展开（子项在 .nav 内会被全局 .nav a 命中，此处逐项复位） */
.nav-item { position: relative; }
.nav-item.has-sub > a::after {
  content: ""; display: inline-block; vertical-align: 1px; margin-left: 6px;
  border-left: 3.5px solid transparent; border-right: 3.5px solid transparent;
  border-top: 4px solid currentColor; opacity: .55;
}
.nav-sub {
  position: absolute; top: 100%; left: 50%; transform: translate(-50%, 8px);
  min-width: 148px; padding: 8px;
  background: #fff; border: 1px solid var(--ink-100); border-radius: 14px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, .12);
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity .18s, transform .18s, visibility .18s;
}
.nav-item:hover .nav-sub,
.nav-item:focus-within .nav-sub {
  opacity: 1; visibility: visible; pointer-events: auto; transform: translate(-50%, 4px);
}
.nav .nav-sublink {
  display: block; white-space: nowrap;
  font-size: 13.5px; font-weight: 500; color: var(--ink-600);
  padding: 8px 12px; border-radius: 8px; background: none;
}
.nav .nav-sublink:hover { color: var(--ink-900); background: var(--ink-50); }
.nav .nav-sublink.active { color: var(--brand); background: var(--ink-50); }

/* 移动端子项：缩进成次级列表，去掉全局 .mnav a::after 的箭头 */
.mnav-sub {
  font-size: 15px !important; font-weight: 500 !important; color: var(--ink-500) !important;
  padding: 10px 4px 10px 20px !important;
}
.mnav a.mnav-sub::after { content: ""; }
</style>

<style>
@import url('@/assets/website.css');
</style>
