<script setup lang="ts"></script>

<template>
  <div class="not-found">
    <el-empty :image-size="260" description="您要访问的页面不存在，请联系管理员开通权限~~~" />
  </div>
</template>
<style scoped>
.not-found {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
