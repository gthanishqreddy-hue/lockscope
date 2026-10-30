import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { ChartTheme } from './chartOptions';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  SVGRenderer,
]);

function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const isLight = css.getPropertyValue('color-scheme').trim() === 'light';
  return {
    text: v('--text-primary'),
    textSecondary: v('--text-secondary'),
    muted: v('--text-muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    surface: v('--surface-1'),
    border: v('--border-strong'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    // Ordinal blue ramp; light mode starts no lighter than step 250, dark no darker than 600.
    ordinal: isLight
      ? ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b']
      : ['#184f95', '#2a78d6', '#5598e7', '#9ec5f4'],
  };
}

/** Re-reads the palette whenever the theme (OS preference or the user's choice) changes. */
function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const update = () => setTheme(readTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    media?.addEventListener?.('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.('change', update);
    };
  }, []);
  return theme;
}

/**
 * ECharts wrapper. The chart is an image to assistive technology, described by {@code title} and
 * {@code description}; pages pair every chart with a table view of the same numbers.
 */
export function Chart({
  build,
  title,
  description,
  tall = false,
}: {
  build: (theme: ChartTheme) => EChartsCoreOption;
  title: string;
  description: string;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const theme = useChartTheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    instance.current = echarts.init(el, undefined, { renderer: 'svg' });
    const resize = new ResizeObserver(() => instance.current?.resize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      instance.current?.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setOption(build(theme), { notMerge: true });
  }, [build, theme]);

  return (
    <figure style={{ margin: 0 }}>
      <div
        ref={ref}
        className={`chart ${tall ? 'chart-tall' : ''}`}
        role="img"
        aria-label={`${title}. ${description}`}
      />
      <figcaption className="visually-hidden">{description}</figcaption>
    </figure>
  );
}
