/**
 * TypeScript mirror of the engine's result schemas
 * (engine/bench/src/main/java/io/lockscope/bench/model). Keep the two in sync.
 *
 * Every file entering the app (bundled, imported or from the engine) goes through
 * {@link parseResultFile}, which validates the shape and rejects anything unexpected,
 * so the rest of the UI can trust these types.
 */

export const BENCHMARK_SCHEMA = 'lockscope.benchmark/v1';
export const CORRECTNESS_SCHEMA = 'lockscope.correctness/v1';

export interface EnvironmentInfo {
  lockscopeVersion: string;
  javaVersion: string;
  javaVendor: string;
  vmName: string;
  vmVersion: string;
  osName: string;
  osVersion: string;
  osArch: string;
  availableProcessors: number;
  maxHeapMb: number;
  jmhVersion: string;
}

export interface Methodology {
  tool: 'jmh';
  mode: 'thrpt' | 'sample';
  scoreUnit: string;
  forks: number;
  warmupIterations: number;
  warmupMillis: number;
  measurementIterations: number;
  measurementMillis: number;
  gcProfiler: boolean;
  errorDefinition: string;
}

export interface Workload {
  profile: string;
  criticalWork: number | null;
  nonCriticalWork: number | null;
  keyRange: number | null;
  readPercent: number | null;
  threadCounts: number[];
}

export interface Measurement {
  algorithm: string;
  threads: number;
  score: number;
  scoreError: number | null;
  unit: string;
  sampleCount: number;
  min: number;
  max: number;
  stdev: number | null;
  iterationScores: number[];
  /** Only present in sample mode; throughput mode does not record latency. */
  percentiles: Record<string, number> | null;
  allocBytesPerOp: number | null;
}

export type ReportOrigin = 'local-engine' | 'bundled-sample';

export interface BenchmarkReport {
  schema: typeof BENCHMARK_SCHEMA;
  id: string;
  createdAt: string;
  origin: ReportOrigin;
  title: string;
  kind: 'lock' | 'set';
  environment: EnvironmentInfo;
  methodology: Methodology;
  workload: Workload;
  measurements: Measurement[];
  warnings: string[];
  reproduceCommand: string;
}

export type CheckStatus = 'PASSED' | 'FAILED' | 'TIMEOUT' | 'ERROR' | 'CANCELLED';

export interface CheckResult {
  check: string;
  algorithm: string;
  threads: number;
  operationsPerThread: number;
  seed: number;
  status: CheckStatus;
  failureCategory: string | null;
  durationMillis: number;
  metrics: Record<string, number>;
  diagnostics: string[];
  negativeControl: boolean;
}

export interface CorrectnessConfig {
  target: 'LOCKS' | 'SETS';
  algorithms: string[];
  threads: number;
  operationsPerThread: number;
  runs: number;
  seed: number;
  criticalSectionWork: number;
  keyRange: number;
  readPercent: number;
  linearizabilityHistories: number;
  linearizabilityOpsPerThread: number;
  linearizabilityKeys: number;
  timeoutMillis: number;
}

export interface CorrectnessSummary {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  errors: number;
  controlsDetected: number;
  controlsMissed: number;
  durationMillis: number;
  asExpected: boolean;
  cancelled: boolean;
}

export interface CorrectnessReport {
  schema: typeof CORRECTNESS_SCHEMA;
  id: string;
  createdAt: string;
  origin: ReportOrigin;
  environment: EnvironmentInfo;
  config: CorrectnessConfig;
  summary: CorrectnessSummary;
  results: CheckResult[];
  reproduceCommand: string;
  limitations: string[];
}

export type ResultReport = BenchmarkReport | CorrectnessReport;

export function isBenchmark(report: ResultReport): report is BenchmarkReport {
  return report.schema === BENCHMARK_SCHEMA;
}

export function isCorrectness(report: ResultReport): report is CorrectnessReport {
  return report.schema === CORRECTNESS_SCHEMA;
}

// ------------------------------------------------------------------ validation

export class SchemaError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'SchemaError';
  }
}

type Json = unknown;

function obj(value: Json, path: string): Record<string, Json> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SchemaError(path, 'expected an object');
  }
  return value as Record<string, Json>;
}

function str(o: Record<string, Json>, key: string, path: string, maxLength = 2000): string {
  const v = o[key];
  if (typeof v !== 'string') throw new SchemaError(`${path}.${key}`, 'expected a string');
  if (v.length > maxLength) throw new SchemaError(`${path}.${key}`, 'string is too long');
  return v;
}

function num(o: Record<string, Json>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new SchemaError(`${path}.${key}`, 'expected a number');
  return v;
}

function optNum(o: Record<string, Json>, key: string, path: string): number | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  return num(o, key, path);
}

function bool(o: Record<string, Json>, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new SchemaError(`${path}.${key}`, 'expected true or false');
  return v;
}

function arr(o: Record<string, Json>, key: string, path: string, maxLength = 100_000): Json[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new SchemaError(`${path}.${key}`, 'expected an array');
  if (v.length > maxLength) throw new SchemaError(`${path}.${key}`, 'array is too long');
  return v;
}

function oneOf<T extends string>(
  o: Record<string, Json>,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const v = str(o, key, path);
  if (!(allowed as readonly string[]).includes(v)) {
    throw new SchemaError(`${path}.${key}`, `expected one of ${allowed.join(', ')}`);
  }
  return v as T;
}

function numberRecord(value: Json, path: string): Record<string, number> {
  const o = obj(value, path);
  const out: Record<string, number> = {};
  for (const key of Object.keys(o)) out[key] = num(o, key, path);
  return out;
}

const ORIGINS = ['local-engine', 'bundled-sample'] as const;

function parseEnvironment(value: Json, path: string): EnvironmentInfo {
  const o = obj(value, path);
  return {
    lockscopeVersion: str(o, 'lockscopeVersion', path),
    javaVersion: str(o, 'javaVersion', path),
    javaVendor: str(o, 'javaVendor', path),
    vmName: str(o, 'vmName', path),
    vmVersion: str(o, 'vmVersion', path),
    osName: str(o, 'osName', path),
    osVersion: str(o, 'osVersion', path),
    osArch: str(o, 'osArch', path),
    availableProcessors: num(o, 'availableProcessors', path),
    maxHeapMb: num(o, 'maxHeapMb', path),
    jmhVersion: str(o, 'jmhVersion', path),
  };
}

function parseMeasurement(value: Json, path: string): Measurement {
  const o = obj(value, path);
  const percentiles = o['percentiles'];
  return {
    algorithm: str(o, 'algorithm', path, 100),
    threads: num(o, 'threads', path),
    score: num(o, 'score', path),
    scoreError: optNum(o, 'scoreError', path),
    unit: str(o, 'unit', path, 50),
    sampleCount: num(o, 'sampleCount', path),
    min: num(o, 'min', path),
    max: num(o, 'max', path),
    stdev: optNum(o, 'stdev', path),
    iterationScores: arr(o, 'iterationScores', path).map((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new SchemaError(`${path}.iterationScores[${i}]`, 'expected a number');
      }
      return v;
    }),
    percentiles:
      percentiles === null || percentiles === undefined
        ? null
        : numberRecord(percentiles, `${path}.percentiles`),
    allocBytesPerOp: optNum(o, 'allocBytesPerOp', path),
  };
}

function strings(o: Record<string, Json>, key: string, path: string): string[] {
  return arr(o, key, path, 10_000).map((v, i) => {
    if (typeof v !== 'string') throw new SchemaError(`${path}.${key}[${i}]`, 'expected a string');
    return v;
  });
}

function parseBenchmark(o: Record<string, Json>): BenchmarkReport {
  const m = obj(o['methodology'], 'methodology');
  const w = obj(o['workload'], 'workload');
  return {
    schema: BENCHMARK_SCHEMA,
    id: str(o, 'id', '$', 100),
    createdAt: str(o, 'createdAt', '$', 100),
    origin: oneOf(o, 'origin', '$', ORIGINS),
    title: str(o, 'title', '$', 300),
    kind: oneOf(o, 'kind', '$', ['lock', 'set'] as const),
    environment: parseEnvironment(o['environment'], 'environment'),
    methodology: {
      tool: oneOf(m, 'tool', 'methodology', ['jmh'] as const),
      mode: oneOf(m, 'mode', 'methodology', ['thrpt', 'sample'] as const),
      scoreUnit: str(m, 'scoreUnit', 'methodology', 50),
      forks: num(m, 'forks', 'methodology'),
      warmupIterations: num(m, 'warmupIterations', 'methodology'),
      warmupMillis: num(m, 'warmupMillis', 'methodology'),
      measurementIterations: num(m, 'measurementIterations', 'methodology'),
      measurementMillis: num(m, 'measurementMillis', 'methodology'),
      gcProfiler: bool(m, 'gcProfiler', 'methodology'),
      errorDefinition: str(m, 'errorDefinition', 'methodology'),
    },
    workload: {
      profile: str(w, 'profile', 'workload', 100),
      criticalWork: optNum(w, 'criticalWork', 'workload'),
      nonCriticalWork: optNum(w, 'nonCriticalWork', 'workload'),
      keyRange: optNum(w, 'keyRange', 'workload'),
      readPercent: optNum(w, 'readPercent', 'workload'),
      threadCounts: arr(w, 'threadCounts', 'workload', 1000).map((v, i) => {
        if (typeof v !== 'number') throw new SchemaError(`workload.threadCounts[${i}]`, 'expected a number');
        return v;
      }),
    },
    measurements: arr(o, 'measurements', '$', 10_000).map((v, i) =>
      parseMeasurement(v, `measurements[${i}]`),
    ),
    warnings: strings(o, 'warnings', '$'),
    reproduceCommand: str(o, 'reproduceCommand', '$'),
  };
}

const STATUSES = ['PASSED', 'FAILED', 'TIMEOUT', 'ERROR', 'CANCELLED'] as const;

function parseCheck(value: Json, path: string): CheckResult {
  const o = obj(value, path);
  const category = o['failureCategory'];
  if (category !== null && category !== undefined && typeof category !== 'string') {
    throw new SchemaError(`${path}.failureCategory`, 'expected a string or null');
  }
  return {
    check: str(o, 'check', path, 100),
    algorithm: str(o, 'algorithm', path, 100),
    threads: num(o, 'threads', path),
    operationsPerThread: num(o, 'operationsPerThread', path),
    seed: num(o, 'seed', path),
    status: oneOf(o, 'status', path, STATUSES),
    failureCategory: typeof category === 'string' ? category : null,
    durationMillis: num(o, 'durationMillis', path),
    metrics: numberRecord(o['metrics'], `${path}.metrics`),
    diagnostics: strings(o, 'diagnostics', path),
    negativeControl: bool(o, 'negativeControl', path),
  };
}

function parseCorrectness(o: Record<string, Json>): CorrectnessReport {
  const c = obj(o['config'], 'config');
  const s = obj(o['summary'], 'summary');
  return {
    schema: CORRECTNESS_SCHEMA,
    id: str(o, 'id', '$', 100),
    createdAt: str(o, 'createdAt', '$', 100),
    origin: oneOf(o, 'origin', '$', ORIGINS),
    environment: parseEnvironment(o['environment'], 'environment'),
    config: {
      target: oneOf(c, 'target', 'config', ['LOCKS', 'SETS'] as const),
      algorithms: strings(c, 'algorithms', 'config'),
      threads: num(c, 'threads', 'config'),
      operationsPerThread: num(c, 'operationsPerThread', 'config'),
      runs: num(c, 'runs', 'config'),
      seed: num(c, 'seed', 'config'),
      criticalSectionWork: num(c, 'criticalSectionWork', 'config'),
      keyRange: num(c, 'keyRange', 'config'),
      readPercent: num(c, 'readPercent', 'config'),
      linearizabilityHistories: num(c, 'linearizabilityHistories', 'config'),
      linearizabilityOpsPerThread: num(c, 'linearizabilityOpsPerThread', 'config'),
      linearizabilityKeys: num(c, 'linearizabilityKeys', 'config'),
      timeoutMillis: num(c, 'timeoutMillis', 'config'),
    },
    summary: {
      total: num(s, 'total', 'summary'),
      passed: num(s, 'passed', 'summary'),
      failed: num(s, 'failed', 'summary'),
      timedOut: num(s, 'timedOut', 'summary'),
      errors: num(s, 'errors', 'summary'),
      controlsDetected: num(s, 'controlsDetected', 'summary'),
      controlsMissed: num(s, 'controlsMissed', 'summary'),
      durationMillis: num(s, 'durationMillis', 'summary'),
      asExpected: bool(s, 'asExpected', 'summary'),
      cancelled: bool(s, 'cancelled', 'summary'),
    },
    results: arr(o, 'results', '$', 50_000).map((v, i) => parseCheck(v, `results[${i}]`)),
    reproduceCommand: str(o, 'reproduceCommand', '$'),
    limitations: strings(o, 'limitations', '$'),
  };
}

/** Maximum accepted size of an imported file, in bytes. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/**
 * Validates parsed JSON as a LockScope result file. Throws {@link SchemaError} with the path of
 * the first problem. Unknown extra fields are ignored; missing or mistyped ones are rejected.
 */
export function parseResultFile(value: unknown): ResultReport {
  const o = obj(value, '$');
  const schema = o['schema'];
  if (schema === BENCHMARK_SCHEMA) return parseBenchmark(o);
  if (schema === CORRECTNESS_SCHEMA) return parseCorrectness(o);
  throw new SchemaError(
    '$.schema',
    `not a LockScope result file (expected "${BENCHMARK_SCHEMA}" or "${CORRECTNESS_SCHEMA}")`,
  );
}

/** Parses JSON text; wraps syntax errors in {@link SchemaError}. */
export function parseResultText(text: string): ResultReport {
  if (text.length > MAX_IMPORT_BYTES) throw new SchemaError('$', 'file is larger than 10 MB');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SchemaError('$', 'the file is not valid JSON');
  }
  return parseResultFile(json);
}
