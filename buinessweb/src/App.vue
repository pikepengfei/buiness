<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useKeepAliveStore } from '@/stores/keepAlive';
import { ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

// 一级视图缓存
const keepStroe = useKeepAliveStore();
const firstKeepAliveRoute = keepStroe.firstKeepAliveRoute;

const locale = ref(zhCn);

onMounted(() => {});
</script>

<template>
  <router-view v-slot="{ Component }">
    <el-config-provider :locale="locale">
      <keep-alive :include="firstKeepAliveRoute">
        <component :is="Component" />
      </keep-alive>
    </el-config-provider>
  </router-view>
</template>

<style>
@import url('@/assets/style/main.css');
</style>
