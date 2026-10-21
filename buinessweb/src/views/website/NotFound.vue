<script setup lang="ts">
// 404 为顶层路由（不被 WebsiteLayout 包裹），故此处自带导航与页脚，保持与原型一致。
</script>

<template>
  <div class="site-root web-scope">
    <!-- ===================== NAV ===================== -->
    <header class="topbar">
      <div class="container topbar-inner">
        <router-link class="brand" to="/">
          <img src="/website/img/logo-black.png" alt="Centremix 芯联创" />
        </router-link>
        <nav class="nav">
          <router-link to="/">首页</router-link>
          <router-link to="/about">关于我们</router-link>
          <router-link to="/products">产品中心</router-link>
          <router-link to="/news">新闻咨询</router-link>
          <router-link to="/contact">售后服务</router-link>
        </nav>
        <router-link class="nav-cta" to="/contact">售后服务 →</router-link>
      </div>
    </header>

    <!-- ===================== 404 ===================== -->
    <main class="site-main">
      <section>
        <div class="container nf-wrap">
          <div class="nf-code">404</div>
          <div class="nf-title">页面不存在或已被移除</div>
          <p class="nf-desc">你访问的页面可能已变更地址，或链接已失效。回到首页，或前往产品中心与新闻咨询继续浏览。</p>
          <div class="nf-actions">
            <router-link to="/" class="btn">返回首页</router-link>
            <router-link to="/products" class="btn btn-ghost">浏览产品中心</router-link>
            <router-link to="/search" class="btn btn-ghost">站内搜索</router-link>
          </div>
        </div>
      </section>
    </main>

    <!-- ===================== FOOTER ===================== -->
    <footer>
      <div class="container foot-grid">
        <div class="foot-brand">
          <img src="/website/img/logo-white.png" alt="Centremix 芯联创" />
          <p>Centremix 芯联创 —— 2022 年与希捷工厂深度合作创立的自营存储品牌，以「便捷存储」为核心，为国人带来兼具高品质与高性价比的存储类产品。</p>
          <div class="foot-slogan"><span class="c-arc thin white"></span> 聚焦你的多元，存储你的生活</div>
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
          <a href="mailto:info@centremix.com">info@centremix.com</a>
          <a href="tel:01062887359">010-62887359</a>
          <span style="display: block">北京市海淀区中关村大街19号<br>新中关购物中心 B 座北翼 5A 层 B5A01</span>
        </div>
      </div>
      <div class="container foot-bottom">
        <span>© 2026 北京展创振华科技有限公司 · Centremix 芯联创. All Rights Reserved.</span>
        <span>京 ICP 备 2026xxxxxx 号 · 数据守护者</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.site-main {
  flex: 1 0 auto;
}
.nf-wrap {
  text-align: center;
  padding: 90px 0 110px;
  max-width: 640px;
  margin: 0 auto;
}
.nf-code {
  font-size: clamp(80px, 14vw, 150px);
  font-weight: 800;
  line-height: 1;
  color: var(--brand);
  letter-spacing: 0.02em;
}
.nf-title {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
  margin: 18px 0 12px;
}
.nf-desc {
  font-size: 15px;
  color: var(--ink-500);
  line-height: 1.9;
  margin: 0 0 34px;
}
.nf-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
