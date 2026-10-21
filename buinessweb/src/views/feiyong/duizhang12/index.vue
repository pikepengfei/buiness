<script setup lang="ts">
import { onMounted } from 'vue';

onMounted(() => {
  console.log('wo shi feiyong duizhang12:name');
});
</script>

<template>
  <div class="box">
    <empty class="wu-icon" />
  </div>
</template>

<style scoped>
.box {
  display: flex;
  justify-content: center;
  min-height: inherit;
  align-items: center;
}
</style>
