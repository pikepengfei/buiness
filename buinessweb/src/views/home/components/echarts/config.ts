import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  LinesChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart
} from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  LegendComponent,
  PolarComponent,
  GeoComponent,
  ToolboxComponent,
  DataZoomComponent
} from 'echarts/components';
import { LabelLayout, UniversalTransition, LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type {
  BarSeriesOption,
  LineSeriesOption,
  LinesSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
  RadarSeriesOption,
  GaugeSeriesOption
} from 'echarts/charts';
import type {
  TitleComponentOption,
  TooltipComponentOption,
  GridComponentOption,
  DatasetComponentOption
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

export type ECOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | LinesSeriesOption
  | PieSeriesOption
  | RadarSeriesOption
  | GaugeSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | DatasetComponentOption
  | ScatterSeriesOption
>;

echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  LegendComponent,
  PolarComponent,
  GeoComponent,
  ToolboxComponent,
  DataZoomComponent,
  BarChart,
  LineChart,
  LinesChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart,
  LabelLayout,
  UniversalTransition,
  // echarts 6.1.0 起 containLabel 旧行为需显式注册，保持与 6.0 一致的网格留白效果
  LegacyGridContainLabel,
  CanvasRenderer
]);

export default echarts;
