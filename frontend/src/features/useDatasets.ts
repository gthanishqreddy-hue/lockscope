import { useMemo } from 'react';
import { useAppState } from '../app/AppState';
import type { Dataset } from '../services/datasets';
import { isBenchmark, isCorrectness, type BenchmarkReport, type CorrectnessReport } from '../schemas/results';

export type BenchmarkDataset = Dataset & { report: BenchmarkReport };
export type CorrectnessDataset = Dataset & { report: CorrectnessReport };

/** Datasets split by kind, newest user data first, then bundled samples. */
export function useDatasets() {
  const { datasets, bundledStatus, bundledError } = useAppState();
  return useMemo(() => {
    const benchmarks = datasets.filter((d): d is BenchmarkDataset => isBenchmark(d.report));
    const correctness = datasets.filter((d): d is CorrectnessDataset => isCorrectness(d.report));
    return { all: datasets, benchmarks, correctness, bundledStatus, bundledError };
  }, [datasets, bundledStatus, bundledError]);
}

export function datasetTitle(d: Dataset): string {
  if (isBenchmark(d.report)) return d.report.title;
  const r = d.report;
  return `Correctness: ${r.config.target.toLowerCase()} (${r.config.algorithms.length} algorithms, ${r.config.runs} run${r.config.runs === 1 ? '' : 's'})`;
}
