import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { CheckGroup, CopyBlock, NumberField, SelectField, TextField } from '../components/ui';
import { LOCKS, SETS } from '../content/algorithms';
import {
  benchmarkCommand,
  benchmarkPayload,
  correctnessCommand,
  correctnessPayload,
  estimateSeconds,
  validateBenchmark,
  validateCorrectness,
  type BenchmarkForm,
  type CorrectnessForm,
} from '../utils/experimentForms';
import { formatDuration } from '../utils/format';
import { EngineNotice } from './EngineNotice';
import { ExperimentProgress } from './ExperimentProgress';
import { useExperimentRunner } from './useExperimentRunner';

const LOCK_OPTIONS = LOCKS.filter((l) => l.category !== 'control').map((l) => ({
  value: l.id,
  label: l.name,
}));
const LOCK_OPTIONS_WITH_CONTROL = LOCKS.map((l) => ({ value: l.id, label: l.name }));
const SET_OPTIONS = SETS.map((s) => ({ value: s.id, label: s.name }));

/** Built-in profiles, mirroring engine/bench BenchmarkProfiles; used before the engine is reachable. */
export const PROFILES: {
  name: string;
  kind: 'lock' | 'set';
  description: string;
  values: Partial<BenchmarkForm>;
}[] = [
  {
    name: 'lock-high-contention',
    kind: 'lock',
    description: 'Tiny critical section, no private work.',
    values: { criticalWork: 10, nonCriticalWork: 0 },
  },
  {
    name: 'lock-moderate-contention',
    kind: 'lock',
    description: 'Some private work between acquisitions.',
    values: { criticalWork: 10, nonCriticalWork: 200 },
  },
  {
    name: 'lock-low-contention',
    kind: 'lock',
    description: 'Mostly private work.',
    values: { criticalWork: 10, nonCriticalWork: 2000 },
  },
  {
    name: 'lock-short-cs',
    kind: 'lock',
    description: 'Empty critical section: raw hand-off cost.',
    values: { criticalWork: 0, nonCriticalWork: 0 },
  },
  {
    name: 'lock-long-cs',
    kind: 'lock',
    description: 'Long critical section.',
    values: { criticalWork: 500, nonCriticalWork: 100 },
  },
  {
    name: 'set-read-heavy',
    kind: 'set',
    description: '90% contains on 1024 keys.',
    values: { keyRange: 1024, readPercent: 90 },
  },
  {
    name: 'set-balanced',
    kind: 'set',
    description: '50% contains on 1024 keys.',
    values: { keyRange: 1024, readPercent: 50 },
  },
  {
    name: 'set-write-heavy',
    kind: 'set',
    description: '10% contains on 1024 keys.',
    values: { keyRange: 1024, readPercent: 10 },
  },
  {
    name: 'set-small-high-contention',
    kind: 'set',
    description: 'Balanced mix on 64 keys.',
    values: { keyRange: 64, readPercent: 50 },
  },
  {
    name: 'set-large',
    kind: 'set',
    description: 'Read-heavy mix on 8192 keys.',
    values: { keyRange: 8192, readPercent: 90 },
  },
];

export function defaultBenchmarkForm(kind: 'lock' | 'set', algorithms?: string[]): BenchmarkForm {
  const profile = PROFILES.find((p) => p.kind === kind);
  return {
    kind,
    profile: profile?.name ?? 'custom',
    algorithms:
      algorithms ?? (kind === 'lock' ? LOCK_OPTIONS.map((o) => o.value) : SET_OPTIONS.map((o) => o.value)),
    threadCounts: '1,2,4,8',
    criticalWork: 10,
    nonCriticalWork: 0,
    keyRange: 1024,
    readPercent: 90,
    mode: 'thrpt',
    forks: 2,
    warmupIterations: 5,
    warmupMillis: 1000,
    measurementIterations: 5,
    measurementMillis: 1000,
    gcProfiler: true,
    ...profile?.values,
  };
}

export function BenchmarkBuilder({
  kind: fixedKind,
  initialAlgorithms,
}: {
  kind?: 'lock' | 'set';
  initialAlgorithms?: string[];
}) {
  const { engineState } = useAppState();
  const [form, setForm] = useState<BenchmarkForm>(() =>
    defaultBenchmarkForm(fixedKind ?? 'lock', initialAlgorithms),
  );
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateBenchmark(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const runner = useExperimentRunner();
  // Errors show as soon as the user edits, even while the run button is disabled (no engine).
  const set = <K extends keyof BenchmarkForm>(key: K, value: BenchmarkForm[K]) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const shown = (key: keyof BenchmarkForm) => (touched ? errors[key] : undefined);
  const profiles = PROFILES.filter((p) => p.kind === form.kind);

  const applyProfile = (name: string) => {
    const p = PROFILES.find((x) => x.name === name);
    setForm((f) => ({ ...f, profile: name, ...(p?.values ?? {}) }));
  };

  const submit = () => {
    setTouched(true);
    if (valid) void runner.start(benchmarkPayload(form));
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="form-grid">
        {!fixedKind && (
          <SelectField
            label="Benchmark"
            value={form.kind}
            onChange={(k) => setForm(defaultBenchmarkForm(k))}
            options={[
              { value: 'lock', label: 'Locks' },
              { value: 'set', label: 'Concurrent sets' },
            ]}
          />
        )}
        <SelectField
          label="Workload profile"
          value={form.profile}
          onChange={applyProfile}
          options={[
            ...profiles.map((p) => ({ value: p.name, label: p.name })),
            { value: 'custom', label: 'custom' },
          ]}
          hint={profiles.find((p) => p.name === form.profile)?.description ?? 'Your own parameters'}
        />
        <SelectField
          label="Mode"
          value={form.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'thrpt', label: 'Throughput (ops/µs)' },
            { value: 'sample', label: 'Latency sampling (ns/op)' },
          ]}
        />
      </div>
      <CheckGroup
        legend="Algorithms"
        options={form.kind === 'lock' ? LOCK_OPTIONS : SET_OPTIONS}
        selected={form.algorithms}
        onChange={(v) => set('algorithms', v)}
        error={shown('algorithms')}
      />
      <div className="form-grid">
        <TextField
          label="Thread counts"
          value={form.threadCounts}
          onChange={(v) => set('threadCounts', v)}
          error={shown('threadCounts')}
          hint="Comma-separated, e.g. 1,2,4,8"
        />
        {form.kind === 'lock' ? (
          <>
            <NumberField
              label="Critical-section work"
              value={form.criticalWork}
              onChange={(v) => {
                set('criticalWork', v);
                set('profile', 'custom');
              }}
              error={shown('criticalWork')}
              hint="CPU tokens inside the lock"
              min={0}
            />
            <NumberField
              label="Non-critical work"
              value={form.nonCriticalWork}
              onChange={(v) => {
                set('nonCriticalWork', v);
                set('profile', 'custom');
              }}
              error={shown('nonCriticalWork')}
              hint="Private work; more = less contention"
              min={0}
            />
          </>
        ) : (
          <>
            <NumberField
              label="Key range"
              value={form.keyRange}
              onChange={(v) => {
                set('keyRange', v);
                set('profile', 'custom');
              }}
              error={shown('keyRange')}
              hint="List holds about half"
              min={1}
            />
            <NumberField
              label="Read %"
              value={form.readPercent}
              onChange={(v) => {
                set('readPercent', v);
                set('profile', 'custom');
              }}
              error={shown('readPercent')}
              hint="contains(); rest split add/remove"
              min={0}
              max={100}
            />
          </>
        )}
        <NumberField
          label="Forks"
          value={form.forks}
          onChange={(v) => set('forks', v)}
          error={shown('forks')}
          hint="Fresh JVMs per point"
          min={0}
          max={5}
        />
        <NumberField
          label="Warm-up iterations"
          value={form.warmupIterations}
          onChange={(v) => set('warmupIterations', v)}
          error={shown('warmupIterations')}
          min={0}
        />
        <NumberField
          label="Warm-up time (ms)"
          value={form.warmupMillis}
          onChange={(v) => set('warmupMillis', v)}
          error={shown('warmupMillis')}
          min={100}
        />
        <NumberField
          label="Measurement iterations"
          value={form.measurementIterations}
          onChange={(v) => set('measurementIterations', v)}
          error={shown('measurementIterations')}
          min={1}
        />
        <NumberField
          label="Measurement time (ms)"
          value={form.measurementMillis}
          onChange={(v) => set('measurementMillis', v)}
          error={shown('measurementMillis')}
          min={100}
        />
      </div>
      <label className="check" style={{ alignSelf: 'flex-start' }}>
        <input
          type="checkbox"
          checked={form.gcProfiler}
          onChange={(e) => set('gcProfiler', e.target.checked)}
        />
        Record allocation per operation (JMH GC profiler)
      </label>
      <div className="row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={engineState.state !== 'connected' || runner.running || runner.submitting}
        >
          <Play size={15} aria-hidden /> Run on local engine
        </button>
        <span className="small muted">
          {valid
            ? `About ${formatDuration(estimateSeconds(form) * 1000)} (estimate)`
            : touched
              ? 'Fix the highlighted fields'
              : ''}
        </span>
      </div>
      {valid && <EngineNotice what="Benchmarking" command={benchmarkCommand(form)} />}
      {valid && engineState.state === 'connected' && (
        <details>
          <summary className="small">Equivalent command line</summary>
          <CopyBlock text={benchmarkCommand(form)} />
        </details>
      )}
      <ExperimentProgress
        experiment={runner.experiment}
        error={runner.error}
        dataset={runner.dataset}
        onCancel={() => void runner.cancel()}
      />
    </form>
  );
}

export function defaultCorrectnessForm(target: 'locks' | 'sets', algorithms?: string[]): CorrectnessForm {
  return {
    target,
    algorithms:
      algorithms ??
      (target === 'locks' ? LOCK_OPTIONS_WITH_CONTROL.map((o) => o.value) : SET_OPTIONS.map((o) => o.value)),
    threads: 8,
    operationsPerThread: target === 'locks' ? 100_000 : 50_000,
    runs: 3,
    seed: 42,
    criticalSectionWork: 10,
    keyRange: 256,
    readPercent: 50,
    linearizabilityHistories: 300,
    timeoutMillis: 60_000,
  };
}

export function CorrectnessBuilder({
  target: fixedTarget,
  initialAlgorithms,
}: {
  target?: 'locks' | 'sets';
  initialAlgorithms?: string[];
}) {
  const { engineState } = useAppState();
  const [form, setForm] = useState<CorrectnessForm>(() =>
    defaultCorrectnessForm(fixedTarget ?? 'locks', initialAlgorithms),
  );
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateCorrectness(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const runner = useExperimentRunner();
  // Errors show as soon as the user edits, even while the run button is disabled (no engine).
  const set = <K extends keyof CorrectnessForm>(key: K, value: CorrectnessForm[K]) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const shown = (key: keyof CorrectnessForm) => (touched ? errors[key] : undefined);

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) void runner.start(correctnessPayload(form));
      }}
    >
      {!fixedTarget && (
        <div className="form-grid">
          <SelectField
            label="Target"
            value={form.target}
            onChange={(t) => setForm(defaultCorrectnessForm(t))}
            options={[
              { value: 'locks', label: 'Locks' },
              { value: 'sets', label: 'Concurrent sets' },
            ]}
          />
        </div>
      )}
      <CheckGroup
        legend="Algorithms"
        options={form.target === 'locks' ? LOCK_OPTIONS_WITH_CONTROL : SET_OPTIONS}
        selected={form.algorithms}
        onChange={(v) => set('algorithms', v)}
        error={shown('algorithms')}
      />
      <div className="form-grid">
        <NumberField
          label="Threads"
          value={form.threads}
          onChange={(v) => set('threads', v)}
          error={shown('threads')}
          min={1}
        />
        <NumberField
          label="Operations per thread"
          value={form.operationsPerThread}
          onChange={(v) => set('operationsPerThread', v)}
          error={shown('operationsPerThread')}
          min={1}
        />
        <NumberField
          label="Runs"
          value={form.runs}
          onChange={(v) => set('runs', v)}
          error={shown('runs')}
          hint="Seed advances by 1 per run"
          min={1}
          max={20}
        />
        <NumberField
          label="Seed"
          value={form.seed}
          onChange={(v) => set('seed', v)}
          error={shown('seed')}
          hint="Reproduces the workload"
        />
        {form.target === 'locks' ? (
          <NumberField
            label="Critical-section work"
            value={form.criticalSectionWork}
            onChange={(v) => set('criticalSectionWork', v)}
            error={shown('criticalSectionWork')}
            hint="Widens the race window"
            min={0}
          />
        ) : (
          <>
            <NumberField
              label="Key range"
              value={form.keyRange}
              onChange={(v) => set('keyRange', v)}
              error={shown('keyRange')}
              min={1}
            />
            <NumberField
              label="Read %"
              value={form.readPercent}
              onChange={(v) => set('readPercent', v)}
              error={shown('readPercent')}
              min={0}
              max={100}
            />
            <NumberField
              label="Linearizability histories"
              value={form.linearizabilityHistories}
              onChange={(v) => set('linearizabilityHistories', v)}
              error={shown('linearizabilityHistories')}
              hint="Short histories on 3 hot keys"
              min={0}
            />
          </>
        )}
        <NumberField
          label="Timeout (ms)"
          value={form.timeoutMillis}
          onChange={(v) => set('timeoutMillis', v)}
          error={shown('timeoutMillis')}
          hint="Per check"
          min={1000}
        />
      </div>
      <div className="row">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={engineState.state !== 'connected' || runner.running || runner.submitting}
        >
          <Play size={15} aria-hidden /> Run checks on local engine
        </button>
        {touched && !valid && (
          <span className="small" style={{ color: 'var(--critical-text)' }}>
            Fix the highlighted fields
          </span>
        )}
      </div>
      {valid && <EngineNotice what="Correctness testing" command={correctnessCommand(form)} />}
      <ExperimentProgress
        experiment={runner.experiment}
        error={runner.error}
        dataset={runner.dataset}
        onCancel={() => void runner.cancel()}
      />
    </form>
  );
}
