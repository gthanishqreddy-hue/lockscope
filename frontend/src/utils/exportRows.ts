import type { BenchmarkReport } from '../schemas/results';
import type { DatasetSource } from '../services/datasets';

/** Flattened measurement row used by the Results Explorer table and its CSV export. */
export interface MeasurementRow {
  key: string;
  datasetKey: string;
  source: DatasetSource;
  reportId: string;
  title: string;
  kind: 'lock' | 'set';
  profile: string;
  mode: string;
  algorithm: string;
  threads: number;
  score: number;
  scoreError: number | null;
  unit: string;
  p50: number | null;
  p99: number | null;
  allocBytesPerOp: number | null;
  cpus: number;
  javaVersion: string;
  osName: string;
  createdAt: string;
}

export const ROW_COLUMNS: (keyof MeasurementRow)[] = [
  'source',
  'reportId',
  'kind',
  'profile',
  'mode',
  'algorithm',
  'threads',
  'score',
  'scoreError',
  'unit',
  'p50',
  'p99',
  'allocBytesPerOp',
  'cpus',
  'javaVersion',
  'osName',
  'createdAt',
];

export function flatten(datasetKey: string, source: DatasetSource, r: BenchmarkReport): MeasurementRow[] {
  return r.measurements.map((m) => ({
    key: `${datasetKey}|${m.algorithm}|${m.threads}`,
    datasetKey,
    source,
    reportId: r.id,
    title: r.title,
    kind: r.kind,
    profile: r.workload.profile,
    mode: r.methodology.mode,
    algorithm: m.algorithm,
    threads: m.threads,
    score: m.score,
    scoreError: m.scoreError,
    unit: m.unit,
    p50: m.percentiles?.['p50'] ?? null,
    p99: m.percentiles?.['p99'] ?? null,
    allocBytesPerOp: m.allocBytesPerOp,
    cpus: r.environment.availableProcessors,
    javaVersion: r.environment.javaVersion,
    osName: r.environment.osName,
    createdAt: r.createdAt,
  }));
}
