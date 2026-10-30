import type { EChartsCoreOption } from 'echarts/core';
import { seriesSlot, seriesSymbol } from '../content/algorithms';

/** Colors resolved from CSS variables for the active theme. */
export interface ChartTheme {
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  border: string;
  series: string[];
  ordinal: string[];
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function seriesColor(theme: ChartTheme, id: string): string {
  return theme.series[seriesSlot(id) - 1] ?? theme.muted;
}

function baseOption(theme: ChartTheme): EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: theme.textSecondary },
    aria: { enabled: true },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text, fontSize: 12 },
      confine: true,
    },
    legend: {
      top: 0,
      left: 0,
      type: 'scroll',
      icon: 'path://M0,4 L14,4 L14,6 L0,6 Z',
      itemWidth: 16,
      itemHeight: 8,
      textStyle: { color: theme.textSecondary, fontSize: 12 },
      pageTextStyle: { color: theme.textSecondary },
    },
    // ECharts 6 keeps axis labels inside the container by default (outerBounds), no containLabel needed.
    grid: { left: 8, right: 16, top: 40, bottom: 8 },
  };
}

function axisStyle(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.axis } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 11 },
    nameTextStyle: { color: theme.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: theme.grid } },
  };
}

export interface LineSeries {
  id: string;
  name: string;
  /** Dashed line: used to tell a second dataset apart from the first. */
  dashed?: boolean;
  points: { x: number; y: number | null; error?: number | null }[];
}

/**
 * Line chart over thread counts (category axis, so 1, 2, 4, 8 are evenly spaced). One y-axis
 * only. The tooltip lists every series at the hovered x, value first.
 */
export function lineOption(
  theme: ChartTheme,
  series: LineSeries[],
  opts: { xName: string; yName: string; valueFormat?: (v: number) => string; referenceY?: number },
): EChartsCoreOption {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const fmt = opts.valueFormat ?? ((v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 }));
  const lookup = new Map(series.map((s) => [s.name, new Map(s.points.map((p) => [p.x, p]))]));
  return {
    ...baseOption(theme),
    tooltip: {
      ...(baseOption(theme)['tooltip'] as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
      formatter: (params: unknown) => {
        const items = params as {
          seriesName: string;
          color: string;
          axisValue: string;
          value: number | null;
        }[];
        if (items.length === 0) return '';
        const x = items[0]?.axisValue ?? '';
        const rows = items
          .filter((i) => i.value !== null && i.value !== undefined)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((i) => {
            const point = lookup.get(i.seriesName)?.get(Number(x));
            const err =
              point?.error != null ? ` <span style="opacity:.7">±${escapeHtml(fmt(point.error))}</span>` : '';
            return `<div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:12px;height:2px;background:${i.color}"></span><b>${escapeHtml(fmt(i.value ?? 0))}</b>${err}<span style="opacity:.75">${escapeHtml(i.seriesName)}</span></div>`;
          })
          .join('');
        return `<div style="margin-bottom:4px;opacity:.75">${escapeHtml(opts.xName)}: ${escapeHtml(x)}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      data: xs.map(String),
      name: opts.xName,
      nameLocation: 'middle',
      nameGap: 28,
      boundaryGap: false,
      ...axisStyle(theme),
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: opts.yName,
      nameLocation: 'end',
      nameGap: 12,
      ...axisStyle(theme),
      nameTextStyle: { color: theme.muted, fontSize: 11, align: 'left' },
      axisLine: { show: false },
    },
    series: series.map((s, index) => {
      const color = seriesColor(theme, s.id);
      const map = new Map(s.points.map((p) => [p.x, p.y]));
      return {
        type: 'line',
        name: s.name,
        data: xs.map((x) => map.get(x) ?? null),
        connectNulls: false,
        symbol: seriesSymbol(s.id),
        symbolSize: 8,
        lineStyle: { width: 2, color, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color, borderColor: theme.surface, borderWidth: 2 },
        emphasis: { focus: 'series' },
        endLabel:
          series.length <= 4
            ? { show: true, formatter: '{a}', color: theme.textSecondary, fontSize: 11 }
            : undefined,
        markLine:
          index === 0 && opts.referenceY !== undefined
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: theme.axis, type: 'dashed', width: 1 },
                label: { color: theme.muted, fontSize: 10, formatter: 'ideal' },
                data: [{ yAxis: opts.referenceY }],
              }
            : undefined,
      };
    }),
  };
}

/** Grouped bars of latency percentiles; percentile is ordinal, so it uses one hue light-to-dark. */
export function percentileOption(
  theme: ChartTheme,
  categories: { id: string; name: string; percentiles: Record<string, number> }[],
  keys: string[],
  unit: string,
): EChartsCoreOption {
  return {
    ...baseOption(theme),
    tooltip: {
      ...(baseOption(theme)['tooltip'] as object),
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { seriesName: string; name: string; value: number; color: string };
        return `<b>${escapeHtml(item.value.toLocaleString('en-US', { maximumFractionDigits: 1 }))} ${escapeHtml(unit)}</b> <span style="opacity:.75">${escapeHtml(item.seriesName)} · ${escapeHtml(item.name)}</span>`;
      },
    },
    xAxis: {
      type: 'category',
      data: categories.map((c) => c.name),
      ...axisStyle(theme),
      splitLine: { show: false },
    },
    yAxis: {
      type: 'log',
      name: `${unit} (log scale)`,
      ...axisStyle(theme),
      nameTextStyle: { color: theme.muted, fontSize: 11, align: 'left' },
      axisLine: { show: false },
    },
    series: keys.map((key, i) => ({
      type: 'bar',
      name: key,
      barGap: '10%',
      barMaxWidth: 22,
      itemStyle: { color: theme.ordinal[i] ?? theme.muted, borderRadius: [4, 4, 0, 0] },
      data: categories.map((c) => c.percentiles[key] ?? null),
    })),
  };
}
