import { Link } from 'react-router';
import { ArrowRight, Gauge, ListTree, Lock, ShieldCheck } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { Callout, Card, PageHeader, SourceBadge, Stat, StatusText } from '../components/ui';
import { LOCKS, SETS } from '../content/algorithms';
import { ScalingPanel } from '../features/ScalingPanel';
import { datasetTitle, useDatasets } from '../features/useDatasets';
import { formatDate, formatDuration } from '../utils/format';

export function OverviewPage() {
  const { engineState } = useAppState();
  const { benchmarks, correctness, all, bundledStatus, bundledError } = useDatasets();
  // Your own runs come first in the list; among the rest, show the widest thread sweep.
  const lockThroughput = benchmarks.filter(
    (d) => d.report.kind === 'lock' && d.report.methodology.mode === 'thrpt',
  );
  const highlight =
    lockThroughput.find((d) => d.source !== 'bundled-sample') ??
    [...lockThroughput].sort(
      (a, b) => Math.max(...b.report.workload.threadCounts) - Math.max(...a.report.workload.threadCounts),
    )[0] ??
    benchmarks[0];
  const latestCorrectness = correctness[0];
  const textbookLocks = LOCKS.filter((l) => l.category === 'textbook').length;
  const baselines = LOCKS.filter((l) => l.category === 'baseline').length;

  return (
    <>
      <PageHeader
        title="Overview"
        description="LockScope implements textbook locks and concurrent linked lists in Java, checks them for correctness, benchmarks them with JMH and lets you explore the evidence here."
        actions={
          <>
            <Link className="btn" to="/correctness">
              <ShieldCheck size={15} aria-hidden /> Correctness
            </Link>
            <Link className="btn btn-primary" to="/benchmarks">
              <Gauge size={15} aria-hidden /> New experiment
            </Link>
          </>
        }
      />

      <div className="grid grid-4">
        <Card>
          <Stat
            label="Lock implementations"
            value={textbookLocks + baselines}
            hint={`${textbookLocks} textbook + ${baselines} JDK baselines, plus a negative control`}
          />
        </Card>
        <Card>
          <Stat
            label="Concurrent set strategies"
            value={SETS.length}
            hint="coarse, fine, optimistic, lazy, lock-free"
          />
        </Card>
        <Card>
          <Stat
            label="Datasets loaded"
            value={all.length}
            hint={
              bundledStatus === 'loading'
                ? 'Loading bundled samples…'
                : `${benchmarks.length} benchmark, ${correctness.length} correctness`
            }
          />
        </Card>
        <Card>
          <div className="stat">
            <span className="stat-value" style={{ fontSize: 16, paddingTop: 6 }}>
              {engineState.state === 'connected' ? (
                <StatusText tone="good">Connected</StatusText>
              ) : engineState.state === 'checking' ? (
                <StatusText tone="neutral">Checking…</StatusText>
              ) : (
                <StatusText tone="neutral">Not running</StatusText>
              )}
            </span>
            <span className="stat-label">Local engine</span>
            <span className="small muted">
              {engineState.state === 'connected'
                ? `Java ${engineState.capabilities?.environment.javaVersion ?? '?'} · ${engineState.capabilities?.environment.availableProcessors ?? '?'} CPUs`
                : 'Static mode: bundled and imported results only'}
            </span>
          </div>
        </Card>
      </div>

      {bundledStatus === 'error' && (
        <Callout tone="warning" title="Bundled datasets unavailable">
          {bundledError}. Imported files and the local engine still work.
        </Callout>
      )}

      <div className="grid grid-sidebar" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <Card
          title="Benchmark highlight"
          description={highlight ? highlight.report.title : 'No benchmark data loaded yet'}
          actions={
            highlight && (
              <Link className="btn btn-sm" to={`/results/${encodeURIComponent(highlight.key)}`}>
                Details <ArrowRight size={14} aria-hidden />
              </Link>
            )
          }
        >
          {highlight ? (
            <ScalingPanel report={highlight.report} source={highlight.source} showInterpretation={false} />
          ) : (
            <p className="muted">Import a result file or connect the engine to see measurements.</p>
          )}
        </Card>

        <div className="stack">
          <Card title="Latest correctness evidence">
            {latestCorrectness ? (
              <div className="stack">
                <div className="row">
                  <SourceBadge source={latestCorrectness.source} />
                </div>
                <p className="secondary">{datasetTitle(latestCorrectness)}</p>
                {latestCorrectness.report.summary.asExpected ? (
                  <StatusText tone="good">
                    {latestCorrectness.report.summary.passed} checks passed;{' '}
                    {latestCorrectness.report.summary.controlsDetected} negative controls caught
                  </StatusText>
                ) : (
                  <StatusText tone="critical">
                    {latestCorrectness.report.summary.failed +
                      latestCorrectness.report.summary.timedOut +
                      latestCorrectness.report.summary.errors}{' '}
                    checks did not pass
                  </StatusText>
                )}
                <span className="small muted">
                  {formatDate(latestCorrectness.report.createdAt)} ·{' '}
                  {formatDuration(latestCorrectness.report.summary.durationMillis)}
                </span>
                <Link to="/correctness" className="small">
                  Open Correctness Center
                </Link>
              </div>
            ) : (
              <p className="muted">No correctness reports loaded.</p>
            )}
          </Card>
          <Card title="Start here">
            <nav className="stack" aria-label="Laboratories">
              <Link to="/locks" className="row" style={{ textDecoration: 'none' }}>
                <Lock size={16} aria-hidden /> Compare TAS, TTAS, backoff, CLH and MCS
              </Link>
              <Link to="/sets" className="row" style={{ textDecoration: 'none' }}>
                <ListTree size={16} aria-hidden /> Step through list synchronization
              </Link>
              <Link to="/visualizer" className="row" style={{ textDecoration: 'none' }}>
                <Gauge size={16} aria-hidden /> Watch a queue lock hand off
              </Link>
            </nav>
          </Card>
        </div>
      </div>

      <Card title="Recent datasets" description="Every dataset is labelled with where it came from.">
        {all.length === 0 ? (
          <p className="muted">Nothing loaded yet.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {all.slice(0, 6).map((d) => (
              <li key={d.key} className="row" style={{ justifyContent: 'space-between' }}>
                <Link to={`/results/${encodeURIComponent(d.key)}`}>{datasetTitle(d)}</Link>
                <span className="row">
                  <SourceBadge source={d.source} />
                  <span className="small muted">{formatDate(d.report.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
