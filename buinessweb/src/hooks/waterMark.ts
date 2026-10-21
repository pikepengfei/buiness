/**
 * 水印 Hook
 *
 * 核心职责：
 *   1. 使用 watermark-js-plus 在页面中添加水印
 *   2. 水印内容为当前用户工号和姓名
 *
 * 特殊说明：
 *   - 当前用户信息为硬编码演示数据，真实开发应从 store 获取
 */
import { Watermark } from 'watermark-js-plus/es';
import { computed } from 'vue';

/**
 * 初始化页面水印
 * 在指定父元素或 body 上创建网格布局水印
 *
 * @param waterParent - 水印挂载的父元素或选择器，默认为 body
 */
export const useWatermark = (waterParent?: Element | string): void => {
  /** 水印文本内容（工号 + 姓名） */
  const getName = computed(() => {
    return `${'1048888'} ${'王林总'}`;
  });

  const watermark = new Watermark({
    parent: waterParent ?? 'body',
    content: getName.value,
    width: 200,
    height: 200,
    rotate: 22,
    layout: 'grid',
    gridLayoutOptions: {
      rows: 2,
      cols: 2,
      gap: [20, 20],
      matrix: [
        [1, 0],
        [0, 1]
      ]
    },
    advancedStyle: {
      type: 'linear',
      colorStops: [
        {
          offset: 0,
          color: '#303133'
        },
        {
          offset: 1,
          color: '#303133'
        }
      ]
    },
    globalAlpha: 0.1,
    onSuccess: () => {
      // 水印创建成功回调
    }
  });

  watermark.create();
};
