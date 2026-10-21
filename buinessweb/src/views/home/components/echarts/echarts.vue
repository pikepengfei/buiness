<script setup lang="ts" name="ECharts">
import { ref, onMounted, onBeforeUnmount, watch, computed, markRaw, nextTick } from 'vue';
import type { EChartsType, ECElementEvent } from 'echarts/core';
import echarts from './config';
import type { ECOption } from './config';
import { debounce } from 'lodash-es';
interface Props {
  option: ECOption;
  renderer?: 'canvas' | 'svg';
  resize?: boolean;
  theme?: object | string;
  width?: number | string;
  height?: number | string;
  onClick?: (event: ECElementEvent) => any;
}

const props = withDefaults(defineProps<Props>(), {
  renderer: 'canvas',
  resize: true
});

const echartsStyle = computed(() => {
  return props.width || props.height
    ? { height: props.height + 'px', width: props.width + 'px' }
    : { height: '100%', width: '100%' };
});

const chartRef = ref<HTMLDivElement | HTMLCanvasElement>();
const chartInstance = ref<EChartsType>();
const draw = () => {
  if (chartInstance.value) {
    chartInstance.value.setOption(props.option, { notMerge: true });
  }
};
watch(props, () => {
  draw();
});

const init = () => {
  if (!chartRef.value) return;
  chartInstance.value = echarts.getInstanceByDom(chartRef.value);
  if (!chartInstance.value) {
    chartInstance.value = markRaw(
      echarts.init(chartRef.value, props.theme, {
        renderer: props.renderer
      })
    );
    chartInstance.value.on('click', handleClick);
    draw();
  }
};
const resize = () => {
  if (chartInstance.value && props.resize) {
    chartInstance.value.resize({ animation: { duration: 300 } });
  }
};
const debouncedResize = debounce(() => {
  if (chartRef.value) {
    resize();
  }
}, 100);

const handleClick = (event: ECElementEvent) => props.onClick && props.onClick(event);

onMounted(() => {
  nextTick(() => init());
  window.addEventListener('resize', debouncedResize);
});

onBeforeUnmount(() => {
  chartInstance.value?.dispose();
  window.removeEventListener('resize', debouncedResize);
});

defineExpose({
  getInstance: () => chartInstance.value,
  resize,
  draw
});
</script>
<template>
  <div id="echarts" ref="chartRef" :style="echartsStyle" />
</template>
