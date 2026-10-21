import type { ECOption } from './config';

export const createProgressOption = (color: string, bgColor: string): ECOption => ({
  title: [
    {
      text: '已完成',
      left: 'center',
      top: '58%',
      textStyle: {
        color: '#B2B8C2',
        fontSize: 14,
        fontWeight: 100
      }
    },
    {
      text: '75%',
      left: 'center',
      top: 'center',
      textStyle: {
        fontSize: 36,
        color: color,
        fontFamily: 'DINAlternate-Bold, DINAlternate'
      }
    }
  ],
  polar: {
    radius: ['90%', '72%'],
    center: ['50%', '50%']
  },
  angleAxis: {
    max: 100,
    show: false
  },
  radiusAxis: {
    type: 'category',
    show: true,
    axisLabel: { show: false },
    axisLine: { show: false },
    axisTick: { show: false }
  },
  series: [
    {
      name: '',
      type: 'bar',
      roundCap: true,
      barWidth: 30,
      showBackground: true,
      backgroundStyle: { color: bgColor },
      data: [60],
      coordinateSystem: 'polar',
      itemStyle: { color: color }
    }
  ]
});

export const option: ECOption = createProgressOption('#178FD2', '#E8F4FF');

export const option2: ECOption = createProgressOption('#0FD68D', '#DCF8EE');

export const optiond4: ECOption = {
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' }
  },
  legend: { show: false },
  grid: {
    top: '3%',
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'value',
    boundaryGap: [0, 0.01]
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    data: ['招商', '工商', '农行', '浦发', '建行', '其他']
  },
  series: [
    {
      name: '2011',
      type: 'bar',
      barWidth: 15,
      itemStyle: {
        borderRadius: 15,
        color: '#178FD2'
      },
      data: [18203, 23489, 29034, 104970, 131744, 630230]
    }
  ]
};

export const option5: ECOption = {
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: ['一月', '二月', '三月', '四月', '五月', '六月', '七月']
  },
  yAxis: { type: 'value' },
  series: [
    {
      data: [120, 200, 150, 80, 70, 110, 130],
      type: 'bar'
    },
    {
      data: [100, 180, 130, 90, 60, 120, 170],
      type: 'bar'
    }
  ]
};

export const option6: ECOption = {
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  yAxis: { type: 'value' },
  series: [
    {
      data: [820, 932, 901, 934, 1290, 1330, 1320],
      type: 'line',
      areaStyle: {}
    }
  ]
};

export const option7: ECOption = {
  color: ['#DAECFF', '#9BCDFF', '#B7F5E8', '#ABE8FF '],
  tooltip: { trigger: 'item' },
  legend: {
    bottom: '0%',
    left: 'center'
  },
  series: [
    {
      name: 'Access From',
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: false,
      label: { show: true },
      labelLine: {
        length: 20,
        length2: 120,
        lineStyle: { color: '#d3d3d3' }
      },
      data: [
        { value: 1048, name: '培训费用' },
        { value: 735, name: '项目费用' },
        { value: 580, name: '其他费用' },
        { value: 484, name: '产品研发' }
      ]
    }
  ]
};
