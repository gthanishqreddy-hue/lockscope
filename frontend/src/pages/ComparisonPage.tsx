import { useCallback, useMemo, useState } from 'react';
import { Chart } from '../components/Chart';
import { lineOption, type ChartTheme, type LineSeries } from '../components/chartOptions';
import { DataTable } from '../components/DataTable';
import { Callout, Card, CheckGroup, PageHeader, Segmented, SourceBadge, TheoryBadge } from '../components/ui';
import { algorithmName, LOCKS, SETS } from '../content/algorithms';
import { DatasetPicker } from '../features/DatasetPicker';
import { ScalingPanel } from '../features/ScalingPanel';
import { useDatasets } from '../features/useDatasets';
import { comparabilityIssues } from '../utils/compare';
import { formatUnit } from '../utils/format';
import { byAlgorithm, scalingSeries } from '../utils/scaling';

function TheoryTables() {
  const [kind, setKind] = useState<'lock' | 'set'>('lock');
  return (
    <Card
      title="Design characteristics"
      description="What each algorithm guarantees by design. Claims from the literature, not measurements."
      actions={<TheoryBadge />}
    >
      <div className="stack">
        <Segmented
          label="Algorithm family"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'lock', label: 'Locks' },
            { value: 'set', label: 'Concurrent sets' },
          ]}
        />
        {kind === 'lock' ? (
          <DataTable
            caption="Lock design characteristics"
            rows={LOCKS.filter((l) => l.category !== 'control')}
            rowKey={(l) => l.id}
            columns={[
              { key: 'n', header: 'Lock', render: (l) => <strong>{l.name}</strong> },
              { key: 'f', header: 'Fairness', render: (l) => l.fairness },
              { key: 'w', header: 'Waiting', render: (l) => l.waiting },
              { key: 's', header: 'Memory', render: (l) => l.space },
              { key: 'r', header: 'Reentrant', render: (l) => (l.reentrant ? 'Yes' : 'No') },
              {
                key: 'e',
                header: 'Expected scaling',
                render: (l) => <span style={{ whiteSpace: 'normal' }}>{l.expectedScaling}</span>,
              },
              {
                key: 'lim',
                header: 'Main limitation',
                render: (l) => <span style={{ whiteSpace: 'normal' }}>{l.limitations[0]}</span>,
              },
            ]}
          />
        ) : (
          <DataTable
            caption="Concurrent set design characteristics"
            rows={SETS}
            rowKey={(s) => s.id}
            columns={[
              { key: 'n', header: 'Strategy', render: (s) => <strong>{s.name}</strong> },
              {
                key: 'sync',
                header: 'Synchronization',
                render: (s) => <span style={{ whiteSpace: 'normal' }}>{s.synchronization}</span>,
              },
              { key: 'u', header: 'add / remove', render: (s) => s.updateProgress },
              { key: 'c', header: 'contains', render: (s) => s.containsProgress },
              {
                key: 'e',
                header: 'Expected scaling',
                render: (s) => <span style={{ whiteSpace: 'normal' }}>{s.expectedScaling}</span>,
              },
              {
                key: 'lim',
                header: 'Main limitation',
                render: (s) => <span style={{ whiteSpace: 'normal' }}>{s.limitations[0]}</span>,
              },
            ]}
          />
        )}
      </div>
    </Card>
  );
}

export function ComparisonPage() {
  const { benchmarks } = useDatasets();
  const [primaryKey, setPrimaryKey] = useState<string>();
  const primary = benchmarks.find((d) => d.key === primaryKey) ?? benchmarks[0];
  const algorithmsInPrimary = useMemo(
    () => (primary ? [...byAlgorithm(primary.report.measurements).keys()] : []),
    [primary],
  );
  const [selected, setSelected] = useState<string[] | null>(null);
  const algorithms = (selected ?? algorithmsInPrimary).filter((a) => algorithmsInPrimary.includes(a));

  const candidates = useMemo(
    () => benchmarks.filter((d) => d.key !== primary?.key && d.report.kind === primary?.report.kind),
    [benchmarks, primary],
  );
  const [secondaryKey, setSecondaryKey] = useState<string>('');
  const secondary = candidates.find((d) => d.key === secondaryKey);
  const issues = useMemo(
    () => (primary && secondary ? comparabilityIssues([primary.report, secondary.report]) : []),
    [primary, secondary],
  );
  const blocking = issues.some((i) => i.severity === 'blocking');

  const buildOverlay = useCallback(
    (theme: ChartTheme) => {
      const series: LineSeries[] = [];
      for (const [d, dashed] of [
        [primary, false],
        [secondary, true],
      ] as const) {
        if (!d) continue;
        for (const [id, ms] of byAlgorithm(d.report.measurements)) {
          if (!algorithms.includes(id)) continue;
          series.push({
            id,
            name: `${algorithmName(id)} · ${dashed ? 'B' : 'A'}`,
            dashed,
            points: scalingSeries(ms).map((p) => ({ x: p.threads, y: p.throughput, error: p.error })),
          });
        }
      }
      return lineOption(theme, series, {
        xName: 'Threads',
        yName: `Throughput (${formatUnit(primary?.report.methodology.scoreUnit ?? '')})`,
      });
    },
    [primary, secondary, algorithms],
  );

  return (
    <>
      <PageHeader
        title="Algorithm Comparison"
        description="Theory and measurement side by side, kept separate. Compare algorithms within one run, or the same algorithms across two runs when the runs are comparable."
      />
      <TheoryTables />

      <Card
        title="Measured performance"
        description="Algorithms measured in the same run share the environment, workload and settings, which makes this the fairest comparison."
      >
        {primary ? (
          <div className="stack">
            <DatasetPicker
              datasets={benchmarks}
              value={primary.key}
              onChange={(k) => {
                setPrimaryKey(k);
                setSelected(null);
                setSecondaryKey('');
              }}
              label="Run A"
            />
            <CheckGroup
              legend="Algorithms"
              options={algorithmsInPrimary.map((a) => ({ value: a, label: algorithmName(a) }))}
              selected={algorithms}
              onChange={setSelected}
            />
            <ScalingPanel report={primary.report} source={primary.source} algorithms={algorithms} />
          </div>
        ) : (
          <Callout>No benchmark datasets are loaded.</Callout>
        )}
      </Card>

      {primary && (
        <Card
          title="Compare with another run"
          description="Overlay the same algorithms from a second run (dashed lines). LockScope checks whether the two runs are comparable first."
        >
          <div className="stack">
            {candidates.length === 0 ? (
              <Callout>
                No other {primary.report.kind} benchmark is loaded. Import or run another one to compare.
              </Callout>
            ) : (
              <>
                <div className="field" style={{ maxWidth: 520 }}>
                  <label htmlFor="run-b">Run B</label>
                  <select id="run-b" value={secondaryKey} onChange={(e) => setSecondaryKey(e.target.value)}>
                    <option value="">Choose a run…</option>
                    {candidates.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.report.title} · {d.report.environment.availableProcessors} CPUs ·{' '}
                        {d.report.createdAt.slice(0, 10)}
                      </option>
                    ))}
                  </select>
                </div>
                {secondary && (
                  <>
                    <div className="row">
                      <span className="small muted">A:</span> <SourceBadge source={primary.source} />
                      <span className="small muted">B:</span> <SourceBadge source={secondary.source} />
                    </div>
                    {issues.length === 0 ? (
                      <Callout tone="good">
                        Same workload, measurement settings and environment: the runs are comparable.
                      </Callout>
                    ) : (
                      issues.map((i) => (
                        <Callout
                          key={i.message}
                          tone={i.severity === 'blocking' ? 'critical' : 'warning'}
                          title={i.severity === 'blocking' ? 'Not comparable' : 'Weaker comparison'}
                        >
                          {i.message}
                        </Callout>
                      ))
                    )}
                    {!blocking && (
                      <Chart
                        build={buildOverlay}
                        title="Run A versus run B"
                        description={`Throughput versus threads for ${algorithms.length} algorithms in two runs; run B dashed.`}
                        tall
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
