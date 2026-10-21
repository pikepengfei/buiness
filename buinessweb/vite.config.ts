import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import ElementPlus from 'unplugin-element-plus/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {}
  },
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false, // 解决按需文件components.ts 老自动变化问题，切分支影冲突
    }),
    ElementPlus({}),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5190,
    host: true,
    proxy: {
      // 将 /api 代理到本地后端，避开浏览器 CORS（后端需运行在 3000 端口）
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // 本地上传目录（STORAGE_DRIVER=local）静态资源也可代理
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  define: {
    // 启用生产环境构建下激活不匹配的详细警告
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true'
  },
  build: {
    assetsInlineLimit: 10240, // 小于此阈值的导入或引用资源将内联为 base64 编码，以避免额外的 http 请求
    rollupOptions: {
      output: {
        //  分出较大的包，避免体积太大
        manualChunks: {
          lodashEs: ['lodash-es'],
          vue: ['vue'],
          vueRouter: ['vue-router'],
        }
      }
    }
  }
});
