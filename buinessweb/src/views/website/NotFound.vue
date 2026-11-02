<script setup lang="ts">
// 404 是官网 Layout 的子路由：导航、页脚与整套官网样式（website.css）由 WebsiteLayout 提供，
// 此处只渲染内容区，避免复制一份结构导致样式缺失或移动端导航丢失。
</script>

<template>
  <section class="nf-sec">
    <div class="container nf-wrap">
      <p class="nf-code">404</p>
      <h1 class="nf-title">页面不存在或已被移除</h1>
      <p class="nf-desc">你访问的页面可能已变更地址，或链接已失效。回到首页，或前往产品中心与站内搜索继续浏览。</p>
      <div class="nf-actions">
        <router-link to="/" class="btn btn-primary">返回首页</router-link>
        <router-link to="/products" class="btn btn-ghost">浏览产品中心</router-link>
        <router-link to="/search" class="btn btn-ghost">站内搜索</router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 官网样式对裸 section 有 `padding: 96px 0`，此处限定在本页根节点上重设，避免与下方间距再次叠加 */
.nf-sec {
  display: flex;
  align-items: center;
  flex: 1 0 auto;
  padding: 64px 0 96px;
  min-height: 420px;
}
.nf-wrap {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}
.nf-code {
  margin: 0;
  font-size: clamp(72px, 14vw, 150px);
  font-weight: 800;
  line-height: 1;
  color: var(--brand);
  letter-spacing: 0.02em;
}
.nf-title {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
  line-height: 1.4;
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
@media (max-width: 640px) {
  .nf-sec {
    min-height: 0;
    padding: 24px 0 64px;
  }
  /* 移动端三个按钮改为整行，避免折行后宽度不一造成的错落 */
  .nf-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .nf-actions .btn {
    justify-content: center;
    width: 100%;
    max-width: 320px;
    margin: 0 auto;
  }
}
</style>

<style>
/* 仅当 Layout 内容区里是本页时生效：让 404 撑满剩余高度，提示块在视口内垂直居中、页脚始终贴底。
   .site-main 的高度由 flex 分配，子元素用百分比高度取不到值，故只能从父级此处介入。 */
.site-main:has(> .nf-sec) {
  display: flex;
  flex-direction: column;
}
</style>
