import { useMemo, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import {
  Callout,
  Card,
  CheckStatusText,
  CopyBlock,
  EmptyState,
  PageHeader,
  SelectField,
  SourceBadge,
  Stat,
  StatusText,
} from '../components/ui';
import { algorithmName } from '../content/algorithms';
import { CorrectnessBuilder } from '../features/ExperimentForms';
import { datasetTitle, useDatasets } from '../features/useDatasets';
import type { CheckResult } from '../schemas/results';
import { SOURCE_LABEL } from '../services/datasets';
import { downloadText } from '../utils/csv';
import { formatDate, formatDuration } from '../utils/format';

const CHECK_LABEL: Record<string, string> = {
  'lock.lost-update': 'Lost update',
  'lock.mutual-exclusion': 'Overlap detection',
  'set.partitioned-reference': 'Partitioned reference',
  'set.conservation': 'Conservation',
  'set.linearizability': 'Linearizability (bounded)',
};

type Row = CheckResult & { key: string };

export function CorrectnessPage() {
  const { correctness } = useDatasets();
  const [selectedKey, setSelectedKey] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<'all' | 'problems'>('all');
  const dataset = correctness.find((d) => d.key === selectedKey) ?? correctness[0];
  const report = dataset?.report;

  const rows = useMemo<Row[]>(
    () =>
      (report?.results ?? [])
        .map((r, i) => ({ ...r, key: `${i}` }))
        .filter(
          (r) =>
            statusFilter === 'all' || (r.negativeControl ? r.status !== 'FAILED' : r.status !== 'PASSED'),
        ),
    [report, statusFilter],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const expandedRow = rows.find((r) => r.key === expanded);

  return (
    <>
      <PageHeader
        title="Correctness Testing Center"
        description="Evidence that the implementations behave correctly under concurrency, and that the checks themselves can catch a broken implementation."
      />

      <Callout tone="info" title="What these checks show">
        Lock checks look for overlapping owners and lost updates. Set checks compare every result with a
        reference model, verify that successful updates are conserved, and verify short histories for
        linearizability. Passing runs are evidence for the tested configurations, not a proof. The negative
        controls (a no-op lock, and in the engine's own test suite an unsynchronized list) must fail; a check
        that cannot catch them is too weak to trust.
      </Callout>

      {correctness.length === 0 ? (
        <Card>
          <EmptyState icon={<ShieldCheck size={28} aria-hidden />} title="No correctness reports loaded">
            Run a suite below with the local engine, or import a <code>lockscope.correctness/v1</code> file in
            the Results Explorer.
          </EmptyState>
        </Card>
      ) : (
        report &&
        dataset && (
          <Card
            title="Report"
            actions={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  downloadText(`${report.id}.json`, JSON.stringify(report, null, 2), 'application/json')
                }
              >
                <Download size={14} aria-hidden /> Export JSON
              </button>
            }
          >
            <div className="stack">
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ minWidth: 300, maxWidth: 560, flex: 1 }}>
                  <SelectField
                    label="Report"
                    value={dataset.key}
                    onChange={setSelectedKey}
                    options={correctness.map((d) => ({
                      value: d.key,
                      label: `[${SOURCE_LABEL[d.source]}] ${datasetTitle(d)} · ${formatDate(d.report.createdAt)}`,
                    }))}
                  />
                </div>
                <SourceBadge source={dataset.source} />
              </div>
              <div className="grid grid-4">
                <Stat
                  label="Checks passed"
                  value={report.summary.passed}
                  hint={`of ${report.summary.total - report.summary.controlsDetected - report.summary.controlsMissed} on real algorithms`}
                />
                <Stat
                  label="Failed / timed out / errors"
                  value={`${report.summary.failed} / ${report.summary.timedOut} / ${report.summary.errors}`}
                />
                <Stat
                  label="Negative controls caught"
                  value={`${report.summary.controlsDetected} / ${report.summary.controlsDetected + report.summary.controlsMissed}`}
                />
                <Stat
                  label="Duration"
                  value={formatDuration(report.summary.durationMillis)}
                  hint={`${report.config.threads} threads · seed ${report.config.seed}`}
                />
              </div>
              {report.summary.asExpected ? (
                <StatusText tone="good">
                  Every real algorithm passed and every negative control was caught.
                </StatusText>
              ) : report.summary.cancelled ? (
                <StatusText tone="warning">This run was cancelled before all checks ran.</StatusText>
              ) : (
                <StatusText tone="critical">
                  Some results were not as expected. See the failing rows below.
                </StatusText>
              )}
              <div className="row">
                <SelectField
                  label="Show"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All results' },
                    { value: 'problems', label: 'Only unexpected results' },
                  ]}
                />
              </div>
              <DataTable
                caption="Check results"
                rows={rows}
                rowKey={(r) => r.key}
                pageSize={15}
                empty={<p className="muted">No results match this filter.</p>}
                columns={[
                  {
                    key: 'check',
                    header: 'Check',
                    render: (r) => CHECK_LABEL[r.check] ?? r.check,
                    sortValue: (r) => r.check,
                  },
                  {
                    key: 'alg',
                    header: 'Algorithm',
                    render: (r) => algorithmName(r.algorithm) + (r.negativeControl ? ' (control)' : ''),
                    sortValue: (r) => r.algorithm,
                  },
                  {
                    key: 'status',
                    header: 'Outcome',
                    render: (r) => <CheckStatusText status={r.status} negativeControl={r.negativeControl} />,
                    sortValue: (r) => r.status,
                  },
                  { key: 'cat', header: 'Failure category', render: (r) => r.failureCategory ?? '—' },
                  {
                    key: 'seed',
                    header: 'Seed',
                    render: (r) => r.seed,
                    sortValue: (r) => r.seed,
                    numeric: true,
                  },
                  {
                    key: 'ops',
                    header: 'Ops / thread',
                    render: (r) => r.operationsPerThread.toLocaleString('en-US'),
                    numeric: true,
                  },
                  {
                    key: 'dur',
                    header: 'Duration',
                    render: (r) => formatDuration(r.durationMillis),
                    sortValue: (r) => r.durationMillis,
                    numeric: true,
                  },
                  {
                    key: 'detail',
                    header: 'Details',
                    render: (r) => (
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-expanded={expanded === r.key}
                        onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                      >
                        {expanded === r.key ? 'Hide' : 'Show'}
                      </button>
                    ),
                  },
                ]}
              />
              {expandedRow && (
                <div className="card" style={{ background: 'var(--surface-2)' }}>
                  <h3 style={{ marginBottom: 8 }}>
                    {CHECK_LABEL[expandedRow.check] ?? expandedRow.check} ·{' '}
                    {algorithmName(expandedRow.algorithm)} · seed {expandedRow.seed}
                  </h3>
                  <dl className="kv">
                    {Object.entries(expandedRow.metrics).map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{k}</dt>
                        <dd className="tabular">{v.toLocaleString('en-US')}</dd>
                      </div>
                    ))}
                  </dl>
                  {expandedRow.diagnostics.length > 0 && (
                    <pre className="code-block mono" style={{ marginTop: 8 }}>
                      {expandedRow.diagnostics.join('\n')}
                    </pre>
                  )}
                </div>
              )}
              <div className="stack">
                <h3>Reproduce</h3>
                <p className="small secondary">
                  Reruns the same configuration and seeds. The thread interleaving depends on the OS scheduler
                  and is not reproducible.
                </p>
                <CopyBlock text={report.reproduceCommand} />
              </div>
              <div className="stack">
                <h3>Known limitations</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }} className="secondary small">
                  {report.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
              <dl className="kv small">
                <dt>Environment</dt>
                <dd>
                  {report.environment.osName} {report.environment.osArch},{' '}
                  {report.environment.availableProcessors} CPUs, Java {report.environment.javaVersion} (
                  {report.environment.vmName})
                </dd>
                <dt>Created</dt>
                <dd>{formatDate(report.createdAt)}</dd>
              </dl>
            </div>
          </Card>
        )
      )}

      <Card
        title="Run a correctness suite"
        description="Runs in the local Java engine. Include the negative control to see the harness catch a broken lock."
      >
        <CorrectnessBuilder />
      </Card>
    </>
  );
}
