import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Callout, Card, NumberField, PageHeader, SimulationBadge, Tabs, TheoryBadge } from '../components/ui';
import { SETS } from '../content/algorithms';
import { DatasetPicker } from '../features/DatasetPicker';
import { BenchmarkBuilder, CorrectnessBuilder } from '../features/ExperimentForms';
import { ListView } from '../features/ListView';
import { ScalingPanel } from '../features/ScalingPanel';
import { useDatasets } from '../features/useDatasets';
import {
  emptyList,
  members,
  runOp,
  type ListOp,
  type ListStrategy,
  type OpTrace,
  type SimNode,
} from '../sim/listSim';

const STRATEGIES = SETS.map((s) => s.id as ListStrategy);

function initialList(): SimNode[] {
  let list = emptyList();
  for (const k of [10, 20, 30, 40]) list = runOp(list, 'coarse', 'add', k).after;
  return list;
}

export function SetLabPage() {
  const [strategy, setStrategy] = useState<ListStrategy>('lazy');
  const info = SETS.find((s) => s.id === strategy) ?? SETS[0];
  const [list, setList] = useState<SimNode[]>(initialList);
  const [key, setKey] = useState(25);
  const [trace, setTrace] = useState<OpTrace | null>(null);
  const [frame, setFrame] = useState(0);
  const [history, setHistory] = useState<(OpTrace & { strategy: ListStrategy; n: number })[]>([]);
  const [tab, setTab] = useState<'correctness' | 'benchmark'>('correctness');
  const keyError =
    Number.isInteger(key) && key >= -999 && key <= 999 ? undefined : 'Whole number from -999 to 999';

  const run = (op: ListOp) => {
    if (keyError) return;
    const t = runOp(list, strategy, op, key);
    setTrace(t);
    setFrame(0);
    setList(t.after);
    setHistory((h) => [{ ...t, strategy, n: h.length + 1 }, ...h].slice(0, 50));
  };

  const comparison = useMemo(
    () =>
      trace
        ? STRATEGIES.map((s) => ({ strategy: s, ...runOp(listBefore(trace), s, trace.op, trace.key) }))
        : [],
    [trace],
  );

  const { benchmarks } = useDatasets();
  const setDatasets = useMemo(() => benchmarks.filter((d) => d.report.kind === 'set'), [benchmarks]);
  const [datasetKey, setDatasetKey] = useState<string>();
  const dataset = setDatasets.find((d) => d.key === datasetKey) ?? setDatasets[0];
  const current = trace?.frames[frame];
  if (!info) return null;

  return (
    <>
      <PageHeader
        title="Concurrent Data Structure Lab"
        description="Five ways to make a sorted linked-list set thread-safe. Step through what each strategy locks, validates and marks, then look at how they measured."
      />
      <Card>
        <Tabs
          label="Strategy"
          value={strategy}
          onChange={setStrategy}
          tabs={SETS.map((s) => ({ value: s.id as ListStrategy, label: s.name }))}
        />
        <div className="grid grid-2" style={{ paddingTop: 16 }}>
          <div className="stack">
            <div className="row">
              <TheoryBadge />
            </div>
            <p>{info.summary}</p>
            <dl className="kv">
              <dt>Synchronization</dt>
              <dd>{info.synchronization}</dd>
              <dt>add / remove</dt>
              <dd>{info.updateProgress}</dd>
              <dt>contains</dt>
              <dd>{info.containsProgress}</dd>
              <dt>Linearization</dt>
              <dd>{info.linearization}</dd>
              <dt>Expected scaling</dt>
              <dd>{info.expectedScaling}</dd>
            </dl>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="secondary">
              {info.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <pre className="code-block mono">{info.pseudocode}</pre>
        </div>
      </Card>

      <Card
        title="Step through an operation"
        description="Single-threaded model of the algorithm in your browser. It shows the steps one operation takes; it does not run the Java engine or interleave threads."
        actions={<SimulationBadge />}
      >
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 140 }}>
              <NumberField label="Key" value={key} onChange={setKey} error={keyError} min={-999} max={999} />
            </div>
            <button type="button" className="btn" onClick={() => run('add')} disabled={!!keyError}>
              add({Number.isFinite(key) ? key : '?'})
            </button>
            <button type="button" className="btn" onClick={() => run('remove')} disabled={!!keyError}>
              remove
            </button>
            <button type="button" className="btn" onClick={() => run('contains')} disabled={!!keyError}>
              contains
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setList(initialList());
                setTrace(null);
                setHistory([]);
              }}
            >
              <RotateCcw size={14} aria-hidden /> Reset
            </button>
          </div>
          <p className="small muted">Set contents: {`{ ${members(list).join(', ')} }`}</p>
          {current && trace ? (
            <div className="stack">
              <ListView
                nodes={current.nodes}
                listLocked={current.listLocked}
                label={`List at step ${frame + 1}`}
              />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setFrame((f) => Math.max(0, f - 1))}
                    disabled={frame === 0}
                    aria-label="Previous step"
                  >
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  <span className="small tabular" aria-live="polite">
                    Step {frame + 1} / {trace.frames.length}: {current.text}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setFrame((f) => Math.min(trace.frames.length - 1, f + 1))}
                    disabled={frame >= trace.frames.length - 1}
                    aria-label="Next step"
                  >
                    <ChevronRight size={14} aria-hidden />
                  </button>
                </div>
                <span className="small muted">
                  Model counters: {trace.counters.nodesVisited} nodes visited ·{' '}
                  {trace.counters.lockAcquisitions} lock acquisitions · {trace.counters.validations}{' '}
                  validations · {trace.counters.casOps} CAS
                </span>
              </div>
            </div>
          ) : (
            <ListView nodes={list} label="Current list" />
          )}
        </div>
      </Card>

      {trace && (
        <Card
          title={`The same ${trace.op}(${trace.key}) under every strategy`}
          description="Counts of steps in the browser model, starting from the same list. They illustrate the mechanics; they are not timings."
          actions={<SimulationBadge />}
        >
          <DataTable
            caption="Strategy step comparison"
            rowKey={(r) => r.strategy}
            rows={comparison}
            columns={[
              {
                key: 's',
                header: 'Strategy',
                render: (r) => SETS.find((s) => s.id === r.strategy)?.name ?? r.strategy,
              },
              {
                key: 'v',
                header: 'Nodes visited',
                render: (r) => r.counters.nodesVisited,
                sortValue: (r) => r.counters.nodesVisited,
                numeric: true,
              },
              {
                key: 'l',
                header: 'Lock acquisitions',
                render: (r) => r.counters.lockAcquisitions,
                sortValue: (r) => r.counters.lockAcquisitions,
                numeric: true,
              },
              { key: 'val', header: 'Validations', render: (r) => r.counters.validations, numeric: true },
              { key: 'c', header: 'CAS', render: (r) => r.counters.casOps, numeric: true },
              { key: 'r', header: 'Result', render: (r) => String(r.result) },
            ]}
          />
        </Card>
      )}

      {history.length > 0 && (
        <Card title="Operation history" actions={<SimulationBadge />}>
          <DataTable
            caption="Operation history"
            rowKey={(r) => String(r.n)}
            rows={history}
            pageSize={10}
            columns={[
              { key: 'n', header: '#', render: (r) => r.n, numeric: true },
              { key: 's', header: 'Strategy', render: (r) => r.strategy },
              { key: 'o', header: 'Operation', render: (r) => `${r.op}(${r.key})` },
              { key: 'r', header: 'Result', render: (r) => String(r.result) },
              { key: 'v', header: 'Nodes visited', render: (r) => r.counters.nodesVisited, numeric: true },
              { key: 'l', header: 'Locks', render: (r) => r.counters.lockAcquisitions, numeric: true },
            ]}
          />
        </Card>
      )}

      <Card title="Measured strategies" description="Real JMH measurements from loaded datasets.">
        {dataset ? (
          <div className="stack">
            <DatasetPicker datasets={setDatasets} value={dataset.key} onChange={setDatasetKey} />
            <ScalingPanel report={dataset.report} source={dataset.source} />
          </div>
        ) : (
          <Callout>No set benchmark loaded. Run one below or import a result file.</Callout>
        )}
      </Card>

      <Card
        title="Run a concurrent workload"
        description="Correctness checks and benchmarks run in the local Java engine against the real implementations."
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
            <CorrectnessBuilder key={`c-${strategy}`} target="sets" initialAlgorithms={[strategy]} />
          ) : (
            <BenchmarkBuilder key={`b-${strategy}`} kind="set" initialAlgorithms={[strategy]} />
          )}
        </div>
      </Card>
    </>
  );
}

/** Reconstructs the list before an operation from its first frame. */
function listBefore(trace: OpTrace): SimNode[] {
  return (trace.frames[0]?.nodes ?? []).map((n) => ({ key: n.key, marked: n.marked }));
}
