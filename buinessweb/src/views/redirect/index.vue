<template>
  <div></div>
</template>
<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

/**
 * 跳转到 redirect/:path 实际指向的页面
 * redirect 路由之间跳转时组件会被复用（参数变化不会重新挂载），
 * 必须通过 watch 路由变化逐层解析，否则地址会停留在 /redirect/redirect/... 无法回到目标页面
 */
function replaceToTarget(): void {
  if (route.name !== 'redirect') return;
  const { params, query } = route;
  const { path } = params;
  if (!path) return;
  router.replace({ path: '/' + path, query });
}

watch(() => route.fullPath, replaceToTarget, { immediate: true });
</script>
