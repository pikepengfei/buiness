<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useSiteStore } from '@/stores/site';

const site = useSiteStore();
const mobileOpen = ref(false);

// 兜底导航（站点配置未加载时使用）
const fallbackMenus = [
  { title: '首页', url: '/' },
  { title: '关于我们', url: '/about' },
  { title: '产品中心', url: '/products' },
  { title: '新闻咨询', url: '/news' },
  { title: '售后服务', url: '/contact' },
];

onMounted(() => site.ensureLoaded());

const navMenus = () => (site.menus.length ? site.menus : fallbackMenus);
const closeMobile = () => (mobileOpen.value = false);
</script>

<template>
  <div class="site-root web-scope">
    <!-- ===================== NAV ===================== -->
    <header class="topbar">
      <div class="container topbar-inner">
        <router-link class="brand" to="/">
          <img src="/website/img/logo-orange.png" alt="Centremix 芯联创" />
        </router-link>
        <nav class="nav">
          <router-link v-for="m in navMenus()" :key="m.url" :to="m.url" active-class="active">{{ m.title }}</router-link>
        </nav>
        <router-link class="nav-cta" to="/contact">售后服务 →</router-link>
        <button class="nav-burger" aria-label="打开菜单" @click="mobileOpen = !mobileOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <!-- 移动端导航 -->
    <div class="mnav" :class="{ open: mobileOpen }">
      <router-link v-for="m in navMenus()" :key="m.url" :to="m.url" @click="closeMobile">{{ m.title }}</router-link>
      <router-link class="mnav-cta" to="/contact" @click="closeMobile">售后服务 →</router-link>
    </div>

    <!-- ===================== 页面内容 ===================== -->
    <main class="site-main">
      <router-view />
    </main>

    <!-- ===================== FOOTER ===================== -->
    <footer>
      <div class="container foot-grid">
        <div class="foot-brand">
          <img src="/website/img/logo-white.png" alt="Centremix 芯联创" />
          <p>Centremix 芯联创 —— 2022 年与希捷工厂深度合作创立的自营存储品牌，以「便捷存储」为核心，为国人带来兼具高品质与高性价比的存储类产品。</p>
          <div class="foot-slogan"><span class="c-arc thin white"></span> {{ site.slogan || '聚焦你的多元，存储你的生活' }}</div>
        </div>
        <div class="foot-col">
          <h5>公司介绍</h5>
          <router-link to="/about">品牌故事</router-link>
          <router-link to="/about">品牌理念</router-link>
          <router-link to="/about">公司背书</router-link>
          <router-link to="/news">新闻咨询</router-link>
        </div>
        <div class="foot-col">
          <h5>产品与服务</h5>
          <router-link to="/products">产品中心</router-link>
          <router-link to="/products">产品详情</router-link>
          <router-link to="/contact">售后服务</router-link>
          <router-link to="/search">站内搜索</router-link>
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
</style>

<style>
@import url('@/assets/website.css');
</style>
