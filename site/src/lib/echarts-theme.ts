import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  CustomChart,
  LineChart,
  ScatterChart,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
]);

/** Name of the registered ECharts theme; pass as `theme` to every chart. */
export const ECHARTS_THEME = 'site';

/** Canvas text cannot inherit CSS fonts, so every chart takes the UI typeface from the theme. */
export const CHART_FONT_FAMILY = "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif";

echarts.registerTheme(ECHARTS_THEME, {
  textStyle: { fontFamily: CHART_FONT_FAMILY },
});

// Scrolling over a chart scrolls the page (as in lab): plain wheel events stop before ECharts sees them.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'wheel',
    event => {
      if (!event.ctrlKey && event.target instanceof Element && event.target.closest('[_echarts_instance_]')) {
        event.stopPropagation();
      }
    },
    { capture: true, passive: true }
  );
}

export { echarts };
