/**
 * Form models for experiments, their validation (mirroring the engine's bounds so users get
 * feedback before submitting; the engine validates again), the API payloads they become, and the
 * equivalent CLI command for users without a running engine.
 */

export interface BenchmarkForm {
  kind: 'lock' | 'set';
  profile: string;
  algorithms: string[];
  threadCounts: string; // comma-separated, as typed
  criticalWork: number;
  nonCriticalWork: number;
  keyRange: number;
  readPercent: number;
  mode: 'thrpt' | 'sample';
  forks: number;
  warmupIterations: number;
  warmupMillis: number;
  measurementIterations: number;
  measurementMillis: number;
  gcProfiler: boolean;
}

export interface CorrectnessForm {
  target: 'locks' | 'sets';
  algorithms: string[];
  threads: number;
  operationsPerThread: number;
  runs: number;
  seed: number;
  criticalSectionWork: number;
  keyRange: number;
  readPercent: number;
  linearizabilityHistories: number;
  timeoutMillis: number;
}

export type Errors<T> = Partial<Record<keyof T, string>>;

/** Upper bound on threads accepted by the engine on a typical machine (it enforces its own). */
export const MAX_THREADS = 256;
export const LIMITS = {
  forks: [0, 5],
  iterations: [0, 50],
  iterationMillis: [100, 10_000],
  work: [0, 100_000],
  keyRange: [1, 65_536],
  percent: [0, 100],
  runs: [1, 20],
  ops: [1, 10_000_000],
  histories: [0, 100_000],
  timeout: [1_000, 600_000],
  estimatedSeconds: 4 * 3600,
} as const;

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parseThreadCounts(text: string): number[] | null {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const values = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : Number.NaN));
  if (values.some((v) => !Number.isInteger(v) || v < 1 || v > MAX_THREADS)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

export function estimateSeconds(form: BenchmarkForm): number {
  const threads = parseThreadCounts(form.threadCounts) ?? [];
  const perFork =
    form.warmupIterations * form.warmupMillis + form.measurementIterations * form.measurementMillis + 1500;
  return Math.round((form.algorithms.length * threads.length * Math.max(1, form.forks) * perFork) / 1000);
}

export function validateBenchmark(form: BenchmarkForm): Errors<BenchmarkForm> {
  const e: Errors<BenchmarkForm> = {};
  if (form.algorithms.length === 0) e.algorithms = 'Select at least one algorithm.';
  if (parseThreadCounts(form.threadCounts) === null) {
    e.threadCounts = `Enter thread counts between 1 and ${MAX_THREADS}, separated by commas.`;
  }
  if (!inRange(form.criticalWork, LIMITS.work)) e.criticalWork = 'Whole number from 0 to 100,000.';
  if (!inRange(form.nonCriticalWork, LIMITS.work)) e.nonCriticalWork = 'Whole number from 0 to 100,000.';
  if (!inRange(form.keyRange, LIMITS.keyRange)) e.keyRange = 'Whole number from 1 to 65,536.';
  if (!inRange(form.readPercent, LIMITS.percent)) e.readPercent = 'Whole number from 0 to 100.';
  if (!inRange(form.forks, LIMITS.forks)) e.forks = 'Whole number from 0 to 5.';
  if (!inRange(form.warmupIterations, LIMITS.iterations)) e.warmupIterations = 'Whole number from 0 to 50.';
  if (!inRange(form.measurementIterations, [1, 50])) e.measurementIterations = 'Whole number from 1 to 50.';
  if (!inRange(form.warmupMillis, LIMITS.iterationMillis)) e.warmupMillis = 'From 100 to 10,000 ms.';
  if (!inRange(form.measurementMillis, LIMITS.iterationMillis))
    e.measurementMillis = 'From 100 to 10,000 ms.';
  if (Object.keys(e).length === 0 && estimateSeconds(form) > LIMITS.estimatedSeconds) {
    e.measurementIterations = 'This would run for more than 4 hours; reduce iterations, forks or points.';
  }
  return e;
}

export function validateCorrectness(form: CorrectnessForm): Errors<CorrectnessForm> {
  const e: Errors<CorrectnessForm> = {};
  if (form.algorithms.length === 0) e.algorithms = 'Select at least one algorithm.';
  if (!inRange(form.threads, [1, MAX_THREADS])) e.threads = `Whole number from 1 to ${MAX_THREADS}.`;
  if (!inRange(form.operationsPerThread, LIMITS.ops))
    e.operationsPerThread = 'Whole number from 1 to 10,000,000.';
  if (!inRange(form.runs, LIMITS.runs)) e.runs = 'Whole number from 1 to 20.';
  if (!Number.isSafeInteger(form.seed)) e.seed = 'Enter a whole number.';
  if (!inRange(form.criticalSectionWork, LIMITS.work))
    e.criticalSectionWork = 'Whole number from 0 to 100,000.';
  if (!inRange(form.keyRange, [1, 1_000_000])) e.keyRange = 'Whole number from 1 to 1,000,000.';
  if (!inRange(form.readPercent, LIMITS.percent)) e.readPercent = 'Whole number from 0 to 100.';
  if (!inRange(form.linearizabilityHistories, LIMITS.histories)) {
    e.linearizabilityHistories = 'Whole number from 0 to 100,000.';
  }
  if (form.target === 'sets' && form.threads * 8 > 256) {
    e.threads = 'The linearizability check allows at most 32 threads (8 operations each).';
  }
  if (!inRange(form.timeoutMillis, LIMITS.timeout)) e.timeoutMillis = 'From 1,000 to 600,000 ms.';
  return e;
}

export function benchmarkPayload(form: BenchmarkForm): Record<string, unknown> {
  const lock = form.kind === 'lock';
  return {
    type: 'benchmark',
    benchmark: {
      kind: form.kind,
      profile: form.profile,
      algorithms: form.algorithms,
      threadCounts: parseThreadCounts(form.threadCounts) ?? [],
      criticalWork: lock ? form.criticalWork : undefined,
      nonCriticalWork: lock ? form.nonCriticalWork : undefined,
      keyRange: lock ? undefined : form.keyRange,
      readPercent: lock ? undefined : form.readPercent,
      mode: form.mode,
      forks: form.forks,
      warmupIterations: form.warmupIterations,
      warmupMillis: form.warmupMillis,
      measurementIterations: form.measurementIterations,
      measurementMillis: form.measurementMillis,
      gcProfiler: form.gcProfiler,
    },
  };
}

export function correctnessPayload(form: CorrectnessForm): Record<string, unknown> {
  return {
    type: 'correctness',
    correctness: {
      target: form.target,
      algorithms: form.algorithms,
      threads: form.threads,
      operationsPerThread: form.operationsPerThread,
      runs: form.runs,
      seed: form.seed,
      criticalSectionWork: form.criticalSectionWork,
      keyRange: form.keyRange,
      readPercent: form.readPercent,
      linearizabilityHistories: form.linearizabilityHistories,
      timeoutMillis: form.timeoutMillis,
    },
  };
}

const RUN = 'cd engine && ./gradlew :bench:run --args=';

export function benchmarkCommand(form: BenchmarkForm): string {
  const threads = (parseThreadCounts(form.threadCounts) ?? []).join(',');
  const parts = [
    'bench',
    `--kind ${form.kind}`,
    `--profile ${form.profile || 'custom'}`,
    `--algorithms ${form.algorithms.join(',')}`,
    `--threads ${threads}`,
    form.kind === 'lock'
      ? `--cs-work ${form.criticalWork} --ncs-work ${form.nonCriticalWork}`
      : `--key-range ${form.keyRange} --read-percent ${form.readPercent}`,
    `--mode ${form.mode}`,
    `--forks ${form.forks}`,
    `--wi ${form.warmupIterations} --wt ${form.warmupMillis}`,
    `--mi ${form.measurementIterations} --mt ${form.measurementMillis}`,
  ];
  if (!form.gcProfiler) parts.push('--no-gc');
  return `${RUN}"${parts.join(' ')}"`;
}

export function correctnessCommand(form: CorrectnessForm): string {
  const parts = [
    'stress',
    `--target ${form.target}`,
    `--algorithms ${form.algorithms.join(',')}`,
    `--threads ${form.threads}`,
    `--ops ${form.operationsPerThread}`,
    `--runs ${form.runs}`,
    `--seed ${form.seed}`,
    form.target === 'locks'
      ? `--cs-work ${form.criticalSectionWork}`
      : `--key-range ${form.keyRange} --read-percent ${form.readPercent} --lin-histories ${form.linearizabilityHistories}`,
    `--timeout-ms ${form.timeoutMillis}`,
  ];
  return `${RUN}"${parts.join(' ')}"`;
}
