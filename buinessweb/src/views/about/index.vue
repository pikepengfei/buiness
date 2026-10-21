<script lang="ts" setup>
import { onMounted, onActivated, ref } from 'vue';
import {useRouter,} from 'vue-router'
defineOptions({
  name: 'about1'
});

const input = ref('');
const $router = useRouter()

onMounted(() => {
  console.log('wo shi about onMounted');
});

onActivated(() => {
  console.log('wo shi about onActivated');
});

const handleClick = () => {
  $router.push({
    name: 'test1'
  })
}
</script>

<template>
  <div class="common-layout">
    <el-container>
      <el-header>Header</el-header>
      <el-container>
        <el-aside width="200px">Aside</el-aside>
        <el-container>
          <el-main>Main</el-main>
          <el-footer>Footer</el-footer>
        </el-container>
      </el-container>
    </el-container>
  </div>
  <el-input v-model="input" placeholder="Please input" />
  <el-link @click="handleClick">去动因反馈页面</el-link>
</template>
