import { useCallback, useMemo, useState } from 'react';
import { Chart } from '../components/Chart';
import { lineOption, percentileOption, type ChartTheme, type LineSeries } from '../components/chartOptions';
import { DataTable, type Column } from '../components/DataTable';
import { Callout, Segmented, SourceBadge } from '../components/ui';
import { algorithmName } from '../content/algorithms';
import type { BenchmarkReport, Measurement } from '../schemas/results';
import type { DatasetSource } from '../services/datasets';
import { formatNumber, formatPercent, formatUnit } from '../utils/format';
import { byAlgorithm, interpret, scalingSeries } from '../utils/scaling';

type Metric = 'throughput' | 'speedup' | 'efficiency';
type View = 'chart' | 'table';

interface Row {
  key: string;
  algorithm: string;
  threads: number;
  m: Measurement;
  speedup: number | null;
  efficiency: number | null;
}

/**
 * Throughput / speedup / efficiency over thread count for one benchmark report, with a table
 * view of the same numbers and cautious interpretation notes. Sample-mode reports show latency
 * percentiles instead.
 */
export function ScalingPanel({
  report,
  source,
  algorithms,
  showInterpretation = true,
}: {
  report: BenchmarkReport;
  source: DatasetSource;
  algorithms?: string[];
  showInterpretation?: boolean;
}) {
  const [metric, setMetric] = useState<Metric>('throughput');
  const [view, setView] = useState<View>('chart');
  const sample = report.methodology.mode === 'sample';
  const unit = formatUnit(report.methodology.scoreUnit);

  const measurements = useMemo(
    () => report.measurements.filter((m) => !algorithms || algorithms.includes(m.algorithm)),
    [report, algorithms],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [algorithm, ms] of byAlgorithm(measurements)) {
      const points = scalingSeries(ms);
      for (const m of ms) {
        const p = points.find((x) => x.threads === m.threads);
        out.push({
          key: `${algorithm}-${m.threads}`,
          algorithm,
          threads: m.threads,
          m,
          speedup: sample ? null : (p?.speedup ?? null),
          efficiency: sample ? null : (p?.efficiency ?? null),
        });
      }
    }
    return out;
  }, [measurements, sample]);

  const build = useCallback(
    (theme: ChartTheme) => {
      if (sample) {
        const atMax = Math.max(...measurements.map((m) => m.threads));
        const cats = measurements
          .filter((m) => m.threads === atMax && m.percentiles)
          .map((m) => ({
            id: m.algorithm,
            name: algorithmName(m.algorithm),
            percentiles: m.percentiles ?? {},
          }));
        return percentileOption(theme, cats, ['p50', 'p90', 'p99', 'p99.9'], 'ns');
      }
      const series: LineSeries[] = [...byAlgorithm(measurements)].map(([id, ms]) => ({
        id,
        name: algorithmName(id),
        points: scalingSeries(ms).map((p) => ({
          x: p.threads,
          y: metric === 'throughput' ? p.throughput : metric === 'speedup' ? p.speedup : p.efficiency,
          error: metric === 'throughput' ? p.error : null,
        })),
      }));
      return lineOption(theme, series, {
        xName: 'Threads',
        yName:
          metric === 'throughput'
            ? `Throughput (${unit})`
            : metric === 'speedup'
              ? 'Speedup S(n) = X(n)/X(1)'
              : 'Efficiency E(n) = S(n)/n',
        valueFormat: metric === 'efficiency' ? (v) => formatPercent(v) : (v) => formatNumber(v),
        referenceY: metric === 'speedup' || metric === 'efficiency' ? 1 : undefined,
      });
    },
    [measurements, metric, sample, unit],
  );

  const columns: Column<Row>[] = [
    {
      key: 'algorithm',
      header: 'Algorithm',
      render: (r) => algorithmName(r.algorithm),
      sortValue: (r) => r.algorithm,
    },
    {
      key: 'threads',
      header: 'Threads',
      render: (r) => r.threads,
      sortValue: (r) => r.threads,
      numeric: true,
    },
    {
      key: 'score',
      header: sample ? 'Mean (ns/op)' : `Throughput (${unit})`,
      render: (r) => formatNumber(r.m.score),
      sortValue: (r) => r.m.score,
      numeric: true,
    },
    {
      key: 'err',
      header: '± 99.9% CI',
      render: (r) => formatNumber(r.m.scoreError),
      sortValue: (r) => r.m.scoreError,
      numeric: true,
    },
    ...(sample
      ? (['p50', 'p99', 'p99.9'] as const).map<Column<Row>>((k) => ({
          key: k,
          header: `${k} (ns)`,
          render: (r) => formatNumber(r.m.percentiles?.[k] ?? null, 0),
          sortValue: (r) => r.m.percentiles?.[k] ?? null,
          numeric: true,
        }))
      : [
          {
            key: 'speedup',
            header: 'Speedup',
            render: (r: Row) => (r.speedup === null ? '—' : `${r.speedup.toFixed(2)}×`),
            sortValue: (r: Row) => r.speedup,
            numeric: true,
          },
          {
            key: 'eff',
            header: 'Efficiency',
            render: (r: Row) => formatPercent(r.efficiency),
            sortValue: (r: Row) => r.efficiency,
            numeric: true,
          },
        ]),
    {
      key: 'alloc',
      header: 'Alloc (B/op)',
      render: (r) => formatNumber(r.m.allocBytesPerOp, 2),
      sortValue: (r) => r.m.allocBytesPerOp,
      numeric: true,
    },
  ];

  const notes = useMemo(
    () => (showInterpretation ? interpret({ ...report, measurements }, algorithmName) : []),
    [report, measurements, showInterpretation],
  );

  const maxThreads = Math.max(...measurements.map((m) => m.threads));
  const description = sample
    ? `Latency percentiles at ${maxThreads} threads for ${byAlgorithm(measurements).size} algorithms, log scale.`
    : `${metric} versus thread count for ${byAlgorithm(measurements).size} algorithms. ${report.title}.`;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <SourceBadge source={source} />
          <span className="small muted">
            JMH {report.methodology.mode} · {report.methodology.forks} fork(s) ×{' '}
            {report.methodology.measurementIterations} × {report.methodology.measurementMillis} ms ·{' '}
            {report.environment.availableProcessors} CPUs, Java {report.environment.javaVersion}
          </span>
        </div>
        <div className="row">
          {!sample && view === 'chart' && (
            <Segmented
              label="Metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'throughput', label: 'Throughput' },
                { value: 'speedup', label: 'Speedup' },
                { value: 'efficiency', label: 'Efficiency' },
              ]}
            />
          )}
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      </div>
      {measurements.length === 0 ? (
        <Callout>No measurements for the selected algorithms in this dataset.</Callout>
      ) : view === 'chart' ? (
        <Chart build={build} title={report.title} description={description} tall />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          caption={report.title}
          initialSort={{ key: 'threads', dir: 'asc' }}
        />
      )}
      {sample && view === 'chart' && (
        <p className="legend-note">
          Bars show p50 → p99.9 (light to dark) at the highest measured thread count. Percentiles come from
          JMH sample mode; the maximum is a single observation and is listed only in the table.
        </p>
      )}
      {notes.length > 0 && (
        <div className="stack" aria-label="Interpretation">
          {notes.map((n) => (
            <Callout key={n.text} tone={n.kind === 'caution' ? 'warning' : 'info'}>
              {n.text}
            </Callout>
          ))}
        </div>
      )}
    </div>
  );
}
