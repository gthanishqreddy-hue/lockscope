import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { Callout, Card, NumberField, PageHeader, SelectField, SimulationBadge } from '../components/ui';
import { lockInfo } from '../content/algorithms';
import { simulateLock, type LockAlgorithm, type SimStep, type ThreadView } from '../sim/lockSim';

const ALGORITHMS: { value: LockAlgorithm; label: string }[] = [
  { value: 'tas', label: 'TAS' },
  { value: 'ttas', label: 'TTAS' },
  { value: 'clh', label: 'CLH queue lock' },
  { value: 'mcs', label: 'MCS queue lock' },
];

const PHASE_LABEL: Record<ThreadView['phase'], string> = {
  idle: 'idle',
  acquiring: 'acquiring',
  waiting: 'waiting',
  critical: 'in critical section',
  releasing: 'releasing',
  done: 'done',
};

export function VisualizerPage() {
  const [algorithm, setAlgorithm] = useState<LockAlgorithm>('mcs');
  const [threads, setThreads] = useState(3);
  const [seed, setSeed] = useState(7);
  const valid = Number.isInteger(threads) && threads >= 2 && threads <= 6 && Number.isSafeInteger(seed);
  const steps = useMemo(
    () => (valid ? simulateLock({ algorithm, threads, acquisitionsPerThread: 2, seed }) : []),
    [algorithm, threads, seed, valid],
  );
  const info = lockInfo(algorithm);

  return (
    <>
      <PageHeader
        title="Execution Visualizer"
        description="Watch threads acquire and release a lock one atomic step at a time: who spins where, what each atomic operation returns, and how queue locks hand off."
      />
      <Callout tone="info" title="Trace source">
        Deterministic demonstration trace: generated in your browser by a step-by-step model of the algorithm
        with a seeded scheduler (seed {seed}). It is not recorded from the JVM and does not model caches or
        the Java Memory Model. The same seed always produces the same trace.
      </Callout>
      <Card title="Scenario" actions={<SimulationBadge label="Deterministic demo trace" />}>
        <div className="form-grid">
          <SelectField
            label="Algorithm"
            value={algorithm}
            onChange={setAlgorithm}
            options={ALGORITHMS}
            hint={info?.summary}
          />
          <NumberField
            label="Threads"
            value={threads}
            onChange={setThreads}
            min={2}
            max={6}
            error={Number.isInteger(threads) && threads >= 2 && threads <= 6 ? undefined : 'From 2 to 6'}
          />
          <NumberField
            label="Schedule seed"
            value={seed}
            onChange={setSeed}
            hint="Change it to see another interleaving"
            error={Number.isSafeInteger(seed) ? undefined : 'Whole number'}
          />
        </div>
      </Card>

      {steps.length > 0 && (
        <TracePlayer key={`${algorithm}-${threads}-${seed}`} steps={steps} algorithm={algorithm} />
      )}
      <Card title="What to notice">
        <ul style={{ margin: 0, paddingLeft: 18 }} className="secondary">
          <li>
            TAS: every waiting step is an atomic read-modify-write; the RMW counter climbs while the lock is
            held.
          </li>
          <li>
            TTAS: waiters mostly read; RMWs happen only when the lock looks free, and several threads can race
            for it at once.
          </li>
          <li>
            CLH: each waiter watches its predecessor's node; on release a thread takes over its predecessor's
            node for next time.
          </li>
          <li>
            MCS: each waiter watches its own node. Look for the step where compareAndSet on the tail fails and
            the owner waits for the successor to link itself.
          </li>
        </ul>
      </Card>
    </>
  );
}

/** Steps through one trace. Remounted (via key) whenever the scenario changes. */
function TracePlayer({ steps, algorithm }: { steps: SimStep[]; algorithm: LockAlgorithm }) {
  const [index, setIndex] = useState(0);
  const [playRequested, setPlaying] = useState(false);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const atEnd = index >= steps.length - 1;
  const playing = playRequested && !atEnd;
  const step = steps[Math.min(index, steps.length - 1)];
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => setIndex((i) => i + 1), 650);
    return () => clearTimeout(t);
  }, [playing, index]);

  useEffect(() => {
    logRef.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!step) return null;
  return (
    <div className="grid grid-sidebar" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)' }}>
      <Card title={`Step ${step.index} of ${steps.length - 1}`}>
        <div className="stack">
          <div className="row" role="group" aria-label="Playback controls">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
              aria-label="Reset to the first step"
            >
              <RotateCcw size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label="Previous step"
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setPlaying((p) => !p)}
              disabled={reducedMotion || atEnd}
              aria-label={playing ? 'Pause' : 'Play'}
              title={reducedMotion ? 'Auto-play is off because reduced motion is requested' : undefined}
            >
              {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
              disabled={index >= steps.length - 1}
              aria-label="Next step"
            >
              <ChevronRight size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setIndex(steps.length - 1)}
              aria-label="Jump to the last step"
            >
              <SkipForward size={14} aria-hidden />
            </button>
            <input
              type="range"
              min={0}
              max={steps.length - 1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label="Step"
              style={{ flex: 1, minWidth: 120, accentColor: 'var(--accent)' }}
            />
          </div>
          <p aria-live="polite" style={{ fontWeight: 500 }}>
            {step.action}
          </p>
          <div className="threads-viz">
            {step.threads.map((t) => (
              <div
                key={t.id}
                className={`thread-card ${t.phase === 'critical' || t.phase === 'releasing' ? 'owner' : ''} ${t.phase === 'waiting' ? 'waiting' : ''}`}
                style={
                  step.thread === t.id
                    ? { outline: '2px solid var(--focus-ring)', outlineOffset: 1 }
                    : undefined
                }
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>T{t.id}</strong>
                  <span className="small secondary">{PHASE_LABEL[t.phase]}</span>
                </div>
                <div className="pc">next: {t.pc}</div>
                <div className="small muted">
                  acquisitions {t.acquisitions}
                  {t.node ? ` · node ${t.node}` : ''}
                  {step.thread === t.id ? ' · just ran' : ''}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-2">
            <div>
              <h3 style={{ marginBottom: 6 }}>Shared variables</h3>
              <dl className="kv mono">
                {Object.entries(step.shared).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                <dt>atomic RMW ops</dt>
                <dd>{step.rmwOps}</dd>
                <dt>shared reads</dt>
                <dd>{step.sharedReads}</dd>
              </dl>
            </div>
            {step.nodes.length > 0 && (
              <div>
                <h3 style={{ marginBottom: 6 }}>Queue nodes</h3>
                <table>
                  <caption className="visually-hidden">Queue nodes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Node</th>
                      <th scope="col">Used by</th>
                      <th scope="col">locked</th>
                      {algorithm === 'mcs' && <th scope="col">next</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {step.nodes.map((n) => (
                      <tr key={n.id}>
                        <td className="mono">{n.id}</td>
                        <td>{n.owner}</td>
                        <td className="mono">{String(n.locked)}</td>
                        {algorithm === 'mcs' && <td className="mono">{n.next ?? 'null'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Card>
      <Card title="Execution history">
        <ol className="log" ref={logRef}>
          {steps.slice(1).map((s) => (
            <li key={s.index} className={s.index === step.index ? 'current' : undefined}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setIndex(s.index)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
              >
                {s.index}. {s.action}
              </button>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
