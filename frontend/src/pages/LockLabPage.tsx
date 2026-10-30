import { useMemo, useState } from 'react';
import { Callout, Card, PageHeader, Tabs, TheoryBadge } from '../components/ui';
import { LOCKS, type LockInfo } from '../content/algorithms';
import { DatasetPicker } from '../features/DatasetPicker';
import { BenchmarkBuilder, CorrectnessBuilder } from '../features/ExperimentForms';
import { ScalingPanel } from '../features/ScalingPanel';
import { useDatasets } from '../features/useDatasets';

const SELECTABLE = LOCKS.filter((l) => l.category !== 'control');

export function LockTheory({ lock }: { lock: LockInfo }) {
  return (
    <div className="grid grid-2">
      <div className="stack">
        <div className="row">
          <TheoryBadge />
          <span className="small muted">
            {lock.category === 'baseline'
              ? 'Standard-library baseline'
              : 'Textbook algorithm, implemented in LockScope'}
          </span>
        </div>
        <p>{lock.summary}</p>
        <dl className="kv">
          <dt>Fairness</dt>
          <dd>{lock.fairness}</dd>
          <dt>Waiting</dt>
          <dd>{lock.waiting}</dd>
          <dt>Progress</dt>
          <dd>{lock.progress}</dd>
          <dt>Reentrant</dt>
          <dd>{lock.reentrant ? 'Yes' : 'No (re-locking throws IllegalMonitorStateException)'}</dd>
          <dt>Interruptible / timeouts</dt>
          <dd>No (not exposed)</dd>
          <dt>Space</dt>
          <dd>{lock.space}</dd>
          <dt>Under contention</dt>
          <dd>{lock.contention}</dd>
          <dt>Expected scaling</dt>
          <dd>{lock.expectedScaling}</dd>
        </dl>
        <div>
          <h3 style={{ marginBottom: 4 }}>Limitations</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="secondary">
            {lock.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="stack">
        <h3>Algorithm</h3>
        <pre className="code-block mono">{lock.pseudocode}</pre>
        <h3>Java Memory Model</h3>
        <p className="secondary small">{lock.memoryOrdering}</p>
      </div>
    </div>
  );
}

export function LockLabPage() {
  const [selected, setSelected] = useState('ttas');
  const [tab, setTab] = useState<'correctness' | 'benchmark'>('correctness');
  const lock = SELECTABLE.find((l) => l.id === selected) ?? SELECTABLE[0];
  const { benchmarks } = useDatasets();
  const lockDatasets = useMemo(
    () =>
      benchmarks.filter(
        (d) => d.report.kind === 'lock' && d.report.measurements.some((m) => m.algorithm === selected),
      ),
    [benchmarks, selected],
  );
  const [datasetKey, setDatasetKey] = useState<string>();
  const dataset = lockDatasets.find((d) => d.key === datasetKey) ?? lockDatasets[0];
  if (!lock) return null;

  return (
    <>
      <PageHeader
        title="Lock Laboratory"
        description="Study one lock at a time: its design, its guarantees, how it measured, and run new checks or benchmarks for it."
      />
      <Card>
        <Tabs
          label="Lock"
          value={lock.id}
          onChange={setSelected}
          tabs={SELECTABLE.map((l) => ({ value: l.id, label: l.name }))}
        />
        <div style={{ paddingTop: 16 }}>
          <LockTheory lock={lock} />
        </div>
      </Card>

      <Card
        title={`Measured: ${lock.name} against the other locks`}
        description="From benchmark datasets that include this lock. The selected lock is shown with every other lock measured in the same run, so the comparison shares one environment and workload."
      >
        {dataset ? (
          <div className="stack">
            <DatasetPicker datasets={lockDatasets} value={dataset.key} onChange={setDatasetKey} />
            <ScalingPanel report={dataset.report} source={dataset.source} />
          </div>
        ) : (
          <Callout>No loaded benchmark includes {lock.name}. Run one below or import a result file.</Callout>
        )}
      </Card>

      <Card
        title="Run an experiment"
        description={`Experiments run in the local Java engine. ${lock.name} is preselected.`}
      >
        <Tabs
          label="Experiment type"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'correctness', label: 'Correctness check' },
            { value: 'benchmark', label: 'Benchmark' },
          ]}
        />
        <div style={{ paddingTop: 16 }}>
          {tab === 'correctness' ? (
            <CorrectnessBuilder key={`c-${lock.id}`} target="locks" initialAlgorithms={[lock.id, 'none']} />
          ) : (
            <BenchmarkBuilder key={`b-${lock.id}`} kind="lock" initialAlgorithms={[lock.id]} />
          )}
        </div>
      </Card>
    </>
  );
}
