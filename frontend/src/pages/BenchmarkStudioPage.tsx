import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { DataTable } from '../components/DataTable';
import { Callout, Card, PageHeader, StatusText } from '../components/ui';
import { BenchmarkBuilder } from '../features/ExperimentForms';
import { engine, EngineError, type Experiment } from '../services/engineClient';
import { formatDate } from '../utils/format';

function RunHistory() {
  const { engineUrl, engineState } = useAppState();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setExperiments(await engine.listExperiments(engineUrl));
      setError(null);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : 'Could not load the run history.');
    }
  }, [engineUrl]);

  const connected = engineState.state === 'connected';
  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;
    engine
      .listExperiments(engineUrl)
      .then((list) => {
        if (!cancelled) setExperiments(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof EngineError ? e.message : 'Could not load the run history.');
      });
    return () => {
      cancelled = true;
    };
  }, [connected, engineUrl]);

  if (engineState.state !== 'connected') {
    return (
      <p className="muted">
        The run history lives in the local engine's memory; connect the engine to see it.
      </p>
    );
  }
  return (
    <div className="stack">
      <div>
        <button type="button" className="btn btn-sm" onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden /> Refresh
        </button>
      </div>
      {error && <Callout tone="critical">{error}</Callout>}
      <DataTable
        caption="Engine run history"
        rows={experiments}
        rowKey={(e) => e.id}
        empty={<p className="muted">No experiments since the engine started.</p>}
        columns={[
          { key: 'id', header: 'Experiment', render: (e) => <span className="mono">{e.id}</span> },
          { key: 'type', header: 'Type', render: (e) => e.type.toLowerCase() },
          {
            key: 'status',
            header: 'Status',
            render: (e) => (
              <StatusText
                tone={
                  e.status === 'SUCCEEDED'
                    ? 'good'
                    : e.status === 'FAILED'
                      ? 'critical'
                      : e.status === 'CANCELLED'
                        ? 'warning'
                        : 'neutral'
                }
              >
                {e.status.toLowerCase()}
              </StatusText>
            ),
          },
          {
            key: 'progress',
            header: 'Progress',
            render: (e) => `${e.completedSteps}/${e.totalSteps}`,
            numeric: true,
          },
          {
            key: 'created',
            header: 'Created',
            render: (e) => formatDate(e.createdAt),
            sortValue: (e) => e.createdAt,
          },
        ]}
      />
      <p className="small muted">
        Completed results are saved in this browser automatically when you start a run from this dashboard;
        find them in the <Link to="/results">Results Explorer</Link>.
      </p>
    </div>
  );
}

export function BenchmarkStudioPage() {
  return (
    <>
      <PageHeader
        title="Benchmark Studio"
        description="Design a JMH experiment, run it on your own machine through the local engine, and follow its real progress."
      />
      <Callout tone="info" title="Measurement method">
        Every point is a separate JMH run (warm-up and measurement iterations in fresh JVM forks). Throughput
        is reported with a 99.9% confidence interval; latency percentiles are recorded only in sampling mode.
        Close other heavy programs while measuring, and compare only runs from the same machine and settings.
      </Callout>
      <Card title="Experiment builder">
        <BenchmarkBuilder />
      </Card>
      <Card
        title="Run history"
        description="Experiments known to the connected engine (kept in memory until it stops)."
      >
        <RunHistory />
      </Card>
    </>
  );
}
