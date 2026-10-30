import { Link, useParams } from 'react-router';
import { Download } from 'lucide-react';
import { Callout, Card, CopyBlock, PageHeader, SourceBadge, StatusText } from '../components/ui';
import { ScalingPanel } from '../features/ScalingPanel';
import { datasetTitle, useDatasets } from '../features/useDatasets';
import { isBenchmark } from '../schemas/results';
import { SOURCE_DESCRIPTION } from '../services/datasets';
import { downloadText, toCsv } from '../utils/csv';
import { flatten, ROW_COLUMNS } from '../utils/exportRows';
import { formatDate, formatUnit } from '../utils/format';

export function DatasetDetailPage() {
  const { datasetKey = '' } = useParams();
  const { all, bundledStatus } = useDatasets();
  const dataset = all.find((d) => d.key === datasetKey);

  if (!dataset) {
    return (
      <>
        <PageHeader title="Dataset" />
        {bundledStatus === 'loading' ? (
          <p className="muted">Loading datasets…</p>
        ) : (
          <Callout tone="warning" title="Dataset not found">
            It may have been removed from this browser.{' '}
            <Link to="/results">Back to the Results Explorer</Link>.
          </Callout>
        )}
      </>
    );
  }

  const { report, source } = dataset;
  const env = report.environment;

  return (
    <>
      <PageHeader
        title={datasetTitle(dataset)}
        description={SOURCE_DESCRIPTION[source]}
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadText(`${report.id}.json`, JSON.stringify(report, null, 2), 'application/json')
              }
            >
              <Download size={14} aria-hidden /> JSON
            </button>
            {isBenchmark(report) && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  downloadText(
                    `${report.id}.csv`,
                    toCsv(
                      ROW_COLUMNS as string[],
                      flatten(dataset.key, source, report) as unknown as Record<string, unknown>[],
                    ),
                    'text/csv',
                  )
                }
              >
                <Download size={14} aria-hidden /> CSV
              </button>
            )}
          </>
        }
      />
      <div className="row">
        <SourceBadge source={source} />
        <span className="small muted">
          Measured {formatDate(report.createdAt)} · <span className="mono">{report.id}</span>
        </span>
      </div>

      {isBenchmark(report) ? (
        <>
          {report.warnings.length > 0 && (
            <div className="stack">
              {report.warnings.map((w) => (
                <Callout key={w} tone="warning">
                  {w}
                </Callout>
              ))}
            </div>
          )}
          <Card title="Results">
            <ScalingPanel report={report} source={source} />
          </Card>
          <div className="grid grid-3">
            <Card title="Workload">
              <dl className="kv">
                <dt>Profile</dt>
                <dd>{report.workload.profile}</dd>
                {report.kind === 'lock' ? (
                  <>
                    <dt>Critical-section work</dt>
                    <dd>{report.workload.criticalWork} tokens</dd>
                    <dt>Non-critical work</dt>
                    <dd>{report.workload.nonCriticalWork} tokens</dd>
                  </>
                ) : (
                  <>
                    <dt>Key range</dt>
                    <dd>{report.workload.keyRange}</dd>
                    <dt>Reads</dt>
                    <dd>{report.workload.readPercent}% contains</dd>
                  </>
                )}
                <dt>Threads</dt>
                <dd>{report.workload.threadCounts.join(', ')}</dd>
              </dl>
            </Card>
            <Card title="Methodology">
              <dl className="kv">
                <dt>Tool</dt>
                <dd>JMH {env.jmhVersion}</dd>
                <dt>Mode</dt>
                <dd>
                  {report.methodology.mode} ({formatUnit(report.methodology.scoreUnit)})
                </dd>
                <dt>Forks</dt>
                <dd>{report.methodology.forks}</dd>
                <dt>Warm-up</dt>
                <dd>
                  {report.methodology.warmupIterations} × {report.methodology.warmupMillis} ms
                </dd>
                <dt>Measurement</dt>
                <dd>
                  {report.methodology.measurementIterations} × {report.methodology.measurementMillis} ms
                </dd>
                <dt>Error bars</dt>
                <dd className="small">{report.methodology.errorDefinition}</dd>
              </dl>
            </Card>
            <Card title="Environment">
              <dl className="kv">
                <dt>OS</dt>
                <dd>
                  {env.osName} {env.osVersion} ({env.osArch})
                </dd>
                <dt>CPUs</dt>
                <dd>{env.availableProcessors} available</dd>
                <dt>Java</dt>
                <dd>
                  {env.javaVersion} ({env.javaVendor})
                </dd>
                <dt>VM</dt>
                <dd>{env.vmName}</dd>
                <dt>Max heap</dt>
                <dd>{env.maxHeapMb} MB</dd>
                <dt>LockScope</dt>
                <dd>{env.lockscopeVersion}</dd>
              </dl>
            </Card>
          </div>
        </>
      ) : (
        <Card title="Correctness summary">
          <div className="stack">
            {report.summary.asExpected ? (
              <StatusText tone="good">
                {report.summary.passed} checks passed, {report.summary.controlsDetected} negative controls
                caught.
              </StatusText>
            ) : (
              <StatusText tone="critical">Not all results were as expected.</StatusText>
            )}
            <Link to="/correctness">Open the full report in the Correctness Center</Link>
          </div>
        </Card>
      )}
      <Card title="Reproduce">
        <CopyBlock text={report.reproduceCommand} />
      </Card>
    </>
  );
}
