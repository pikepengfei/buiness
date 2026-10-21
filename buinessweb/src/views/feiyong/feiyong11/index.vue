<script setup lang="ts">
import { onMounted, onActivated } from 'vue';

onMounted(() => {
  console.log('onMounted... wo shi feiyong-feiyong11');
});

onActivated(() => {
  console.log('onActivated... wo shi feiyong-feiyong11');
});
</script>

<template>
  <div class="box">
    <empty />
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
