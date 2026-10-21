<script lang="ts" setup>
import { onMounted } from 'vue';
import { ElNotification, ElMessage } from 'element-plus';
// const isActive = function (routeView) {
//   console.log('isActive...tag...', routeView)
// };

const open4 = () => {
  ElNotification({
    title: 'Error',
    message: 'This is an error message',
    type: 'error',
    duration: 0
  });
};

const open2 = () => {
  ElMessage({
    message: 'Congrats, this is a success message.',
    type: 'success'
  });
};

onMounted(() => {
  console.log('wo shi http onMounted...');
});
</script>

<template>
  <el-scrollbar>
    <!-- <div :class="isActive(9) ? 'active' : ''">测试</div> -->
    <div class="scrollbar-flex-content">
      <p v-for="item in 50" :key="item" class="scrollbar-demo-item">
        {{ item }}
      </p>
    </div>
  </el-scrollbar>
  <el-button plain @click="open4">Error</el-button>
  <el-button :plain="true" @click="open2">Success</el-button>
</template>

<style scoped>
.scrollbar-flex-content {
  display: flex;
}
.scrollbar-demo-item {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 50px;
  margin: 10px;
  text-align: center;
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style>
