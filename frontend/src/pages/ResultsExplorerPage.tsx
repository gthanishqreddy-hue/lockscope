import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Database, Download, Trash2 } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { DataTable } from '../components/DataTable';
import { Card, EmptyState, PageHeader, SelectField, SourceBadge, Tabs } from '../components/ui';
import { algorithmName } from '../content/algorithms';
import { ImportPanel } from '../features/ImportPanel';
import { datasetTitle, useDatasets } from '../features/useDatasets';
import type { DatasetSource } from '../services/datasets';
import { downloadText, toCsv } from '../utils/csv';
import { flatten, ROW_COLUMNS, type MeasurementRow } from '../utils/exportRows';
import { formatDate, formatNumber, formatUnit } from '../utils/format';

export function ResultsExplorerPage() {
  const { removeDataset } = useAppState();
  const { all, benchmarks } = useDatasets();
  const [tab, setTab] = useState<'measurements' | 'datasets'>('measurements');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'lock' | 'set'>('all');
  const [source, setSource] = useState<'all' | DatasetSource>('all');
  const [threads, setThreads] = useState('all');

  const rows = useMemo(() => benchmarks.flatMap((d) => flatten(d.key, d.source, d.report)), [benchmarks]);
  const threadOptions = useMemo(() => [...new Set(rows.map((r) => r.threads))].sort((a, b) => a - b), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (source === 'all' || r.source === source) &&
        (threads === 'all' || r.threads === Number(threads)) &&
        (q === '' ||
          r.algorithm.toLowerCase().includes(q) ||
          algorithmName(r.algorithm).toLowerCase().includes(q) ||
          r.profile.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q)),
    );
  }, [rows, kind, source, threads, query]);

  const exportCsv = () =>
    downloadText(
      'lockscope-measurements.csv',
      toCsv(ROW_COLUMNS as string[], filtered as unknown as Record<string, unknown>[]),
      'text/csv',
    );
  const exportJson = () =>
    downloadText(
      'lockscope-measurements.json',
      JSON.stringify({ exportedAt: new Date().toISOString(), rows: filtered }, null, 2),
      'application/json',
    );

  return (
    <>
      <PageHeader
        title="Results Explorer"
        description="Every loaded measurement in one place. Filter, sort, open a dataset, import your own runs and export what you need."
      />
      <Card title="Import results">
        <ImportPanel />
      </Card>
      <Card>
        <Tabs
          label="Results view"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'measurements', label: `Measurements (${rows.length})` },
            { value: 'datasets', label: `Datasets (${all.length})` },
          ]}
        />
        <div style={{ paddingTop: 16 }}>
          {tab === 'measurements' ? (
            <div className="stack">
              <div className="form-grid" style={{ alignItems: 'end' }}>
                <div className="field">
                  <label htmlFor="results-search">Search</label>
                  <input
                    id="results-search"
                    type="search"
                    value={query}
                    placeholder="Algorithm, profile, title"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <SelectField
                  label="Kind"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'lock', label: 'Locks' },
                    { value: 'set', label: 'Sets' },
                  ]}
                />
                <SelectField
                  label="Source"
                  value={source}
                  onChange={setSource}
                  options={[
                    { value: 'all', label: 'All sources' },
                    { value: 'bundled-sample', label: 'Bundled sample' },
                    { value: 'imported-file', label: 'Imported file' },
                    { value: 'live-engine', label: 'Local engine run' },
                  ]}
                />
                <SelectField
                  label="Threads"
                  value={threads}
                  onChange={setThreads}
                  options={[
                    { value: 'all', label: 'Any' },
                    ...threadOptions.map((t) => ({ value: String(t), label: String(t) })),
                  ]}
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={exportCsv}
                  disabled={filtered.length === 0}
                >
                  <Download size={14} aria-hidden /> CSV ({filtered.length} rows)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={exportJson}
                  disabled={filtered.length === 0}
                >
                  <Download size={14} aria-hidden /> JSON
                </button>
              </div>
              <DataTable<MeasurementRow>
                caption="Measurements"
                rows={filtered}
                rowKey={(r) => r.key}
                pageSize={20}
                initialSort={{ key: 'profile', dir: 'asc' }}
                empty={
                  <EmptyState
                    icon={<Database size={28} aria-hidden />}
                    title={
                      rows.length === 0 ? 'No measurements loaded' : 'No measurements match these filters'
                    }
                  >
                    {rows.length === 0
                      ? 'Import a result file above or run a benchmark.'
                      : 'Clear a filter to see more.'}
                  </EmptyState>
                }
                columns={[
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
                    header: 'Score',
                    render: (r) => formatNumber(r.score),
                    sortValue: (r) => r.score,
                    numeric: true,
                  },
                  { key: 'err', header: '± 99.9%', render: (r) => formatNumber(r.scoreError), numeric: true },
                  { key: 'unit', header: 'Unit', render: (r) => formatUnit(r.unit) },
                  {
                    key: 'profile',
                    header: 'Workload',
                    render: (r) => r.profile,
                    sortValue: (r) => r.profile,
                  },
                  { key: 'cpus', header: 'CPUs', render: (r) => r.cpus, numeric: true },
                  {
                    key: 'source',
                    header: 'Source',
                    render: (r) => <SourceBadge source={r.source} />,
                    sortValue: (r) => r.source,
                  },
                  {
                    key: 'open',
                    header: 'Dataset',
                    render: (r) => <Link to={`/results/${encodeURIComponent(r.datasetKey)}`}>Open</Link>,
                  },
                ]}
              />
              <p className="small muted">
                Scores from different workloads, modes or machines are listed together here but are not
                comparable; use Algorithm Comparison to compare runs safely.
              </p>
            </div>
          ) : (
            <DataTable
              caption="Datasets"
              rows={all}
              rowKey={(d) => d.key}
              empty={<p className="muted">No datasets loaded.</p>}
              columns={[
                {
                  key: 'title',
                  header: 'Dataset',
                  render: (d) => <Link to={`/results/${encodeURIComponent(d.key)}`}>{datasetTitle(d)}</Link>,
                  sortValue: (d) => datasetTitle(d),
                },
                {
                  key: 'source',
                  header: 'Source',
                  render: (d) => <SourceBadge source={d.source} />,
                  sortValue: (d) => d.source,
                },
                {
                  key: 'created',
                  header: 'Measured',
                  render: (d) => formatDate(d.report.createdAt),
                  sortValue: (d) => d.report.createdAt,
                },
                {
                  key: 'file',
                  header: 'File',
                  render: (d) => <span className="mono small">{d.fileName ?? d.report.id}</span>,
                },
                {
                  key: 'actions',
                  header: '',
                  render: (d) =>
                    d.source === 'bundled-sample' ? (
                      <span className="small muted">Bundled</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeDataset(d.key)}
                        aria-label={`Remove ${datasetTitle(d)} from this browser`}
                      >
                        <Trash2 size={13} aria-hidden /> Remove
                      </button>
                    ),
                },
              ]}
            />
          )}
        </div>
      </Card>
    </>
  );
}
