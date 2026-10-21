/**
 * 平滑滚动工具
 *
 * 核心职责：
 *   1. 提供基于 requestAnimationFrame 的平滑滚动功能
 *   2. 支持 scrollLeft 和 scrollTop 方向
 *   3. 使用 easeInOutQuad 缓动函数实现平滑效果
 *
 * 特殊说明：
 *   - 主要用于标签页栏的左右滚动
 *   - 通过 isActiveRef 控制动画的启停
 */
import { ref, unref } from 'vue';

/** 滚动参数接口 */
export interface ScrollToParams {
  /** 目标滚动元素 */
  el: HTMLElement | null;
  /** 滚动目标位置 */
  to: number;
  /** 滚动方向属性名（scrollLeft / scrollTop） */
  position: string;
  /** 动画持续时间（毫秒），默认 500 */
  duration?: number;
  /** 滚动完成后的回调函数 */
  callback?: () => void;
}

/**
 * 缓入缓出二次缓动函数
 * 使滚动动画在开始和结束时减速，中间加速
 *
 * @param t - 当前时间
 * @param b - 起始值
 * @param c - 变化量（目标值 - 起始值）
 * @param d - 总持续时间
 * @returns 当前时间对应的值
 */
const easeInOutQuad = (t: number, b: number, c: number, d: number): number => {
  t /= d / 2;
  if (t < 1) {
    return (c / 2) * t * t + b;
  }
  t--;
  return (-c / 2) * (t * (t - 2) - 1) + b;
};

/**
 * 设置元素的滚动位置
 *
 * @param el - 目标元素
 * @param position - 滚动属性名
 * @param amount - 滚动量
 */
const move = (el: HTMLElement, position: string, amount: number): void => {
  (el as any)[position] = amount;
};

/**
 * 平滑滚动 Hook
 * 返回 start 和 stop 方法，用于控制滚动动画
 *
 * @param params - 滚动参数
 * @returns start: 开始滚动, stop: 停止滚动
 */
export function useScrollTo({
  el,
  position = 'scrollLeft',
  to,
  duration = 500,
  callback
}: ScrollToParams) {
  /** 动画是否激活的标志 */
  const isActiveRef = ref(false);
  const start = (el as any)[position] as number;
  const change = to - start;
  const increment = 20;
  let currentTime = 0;

  /**
   * 执行单帧滚动动画
   * 使用 requestAnimationFrame 递归调用实现连续动画
   */
  function animateScroll(): void {
    if (!unref(isActiveRef)) {
      return;
    }
    currentTime += increment;
    const val = easeInOutQuad(currentTime, start, change, duration);
    move(el!, position, val);
    if (currentTime < duration && unref(isActiveRef)) {
      requestAnimationFrame(animateScroll);
    } else {
      if (callback) {
        callback();
      }
    }
  }

  /** 开始滚动动画 */
  function run(): void {
    isActiveRef.value = true;
    animateScroll();
  }

  /** 停止滚动动画 */
  function stop(): void {
    isActiveRef.value = false;
  }

  return { start: run, stop };
}
