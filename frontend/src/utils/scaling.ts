import type { BenchmarkReport, Measurement } from '../schemas/results';

/**
 * Speedup and efficiency from throughput measurements (same formulas as the engine's
 * Scaling.java). With fixed work W, T(n) = W / X(n), so S(n) = T(1) / T(n) = X(n) / X(1),
 * and E(n) = S(n) / n. Undefined values are null, never 0 or NaN.
 */

export function speedup(baselineThroughput: number, throughput: number): number | null {
  if (!(baselineThroughput > 0) || !Number.isFinite(baselineThroughput)) return null;
  if (!Number.isFinite(throughput) || throughput < 0) return null;
  return throughput / baselineThroughput;
}

export function efficiency(s: number | null, threads: number): number | null {
  if (s === null || !(threads >= 1)) return null;
  return s / threads;
}

export interface ScalingPoint {
  threads: number;
  throughput: number;
  error: number | null;
  speedup: number | null;
  efficiency: number | null;
}

/** Scaling points for one algorithm, sorted by thread count. Requires a 1-thread baseline. */
export function scalingSeries(measurements: Measurement[]): ScalingPoint[] {
  const sorted = [...measurements].sort((a, b) => a.threads - b.threads);
  const baseline = sorted.find((m) => m.threads === 1)?.score;
  return sorted.map((m) => {
    const s = baseline === undefined ? null : speedup(baseline, m.score);
    return {
      threads: m.threads,
      throughput: m.score,
      error: m.scoreError,
      speedup: s,
      efficiency: efficiency(s, m.threads),
    };
  });
}

/** Measurements grouped by algorithm, preserving first-seen order. */
export function byAlgorithm(measurements: Measurement[]): Map<string, Measurement[]> {
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const list = groups.get(m.algorithm) ?? [];
    list.push(m);
    groups.set(m.algorithm, list);
  }
  return groups;
}

/** Relative half-width of the confidence interval, or null when unknown. */
export function relativeError(m: Measurement): number | null {
  if (m.scoreError === null || !(m.score > 0)) return null;
  return m.scoreError / m.score;
}

/** Whether two confidence intervals overlap (then the difference is not established). */
export function intervalsOverlap(a: Measurement, b: Measurement): boolean {
  if (a.scoreError === null || b.scoreError === null) return true;
  return a.score - a.scoreError <= b.score + b.scoreError && b.score - b.scoreError <= a.score + a.scoreError;
}

export interface Interpretation {
  kind: 'info' | 'caution';
  text: string;
}

/**
 * Cautious, evidence-based statements about one throughput report. Never claims statistical
 * significance: overlapping 99.9% intervals are reported as "not distinguishable".
 */
export function interpret(report: BenchmarkReport, name: (id: string) => string): Interpretation[] {
  if (report.methodology.mode !== 'thrpt') {
    return [
      { kind: 'info', text: 'Sample-mode report: compare latency percentiles rather than throughput.' },
    ];
  }
  const out: Interpretation[] = [];
  const groups = byAlgorithm(report.measurements);
  const threadCounts = [...new Set(report.measurements.map((m) => m.threads))].sort((a, b) => a - b);
  const maxThreads = threadCounts[threadCounts.length - 1];
  if (maxThreads === undefined) return out;

  const atMax = report.measurements.filter((m) => m.threads === maxThreads).sort((a, b) => b.score - a.score);
  const best = atMax[0];
  const second = atMax[1];
  if (best) {
    if (second && intervalsOverlap(best, second)) {
      out.push({
        kind: 'caution',
        text: `At ${maxThreads} threads, ${name(best.algorithm)} and ${name(second.algorithm)} are not distinguishable: their 99.9% confidence intervals overlap.`,
      });
    } else {
      out.push({
        kind: 'info',
        text: `At ${maxThreads} threads, ${name(best.algorithm)} had the highest measured throughput in this workload${second ? `, ahead of ${name(second.algorithm)}` : ''}.`,
      });
    }
  }

  for (const [algorithm, ms] of groups) {
    const series = scalingSeries(ms);
    const last = series[series.length - 1];
    if (!last || last.speedup === null || series.length < 2) continue;
    if (last.speedup < 0.5) {
      out.push({
        kind: 'info',
        text: `${name(algorithm)} lost throughput under contention: ${last.threads} threads reached ${(last.speedup * 100).toFixed(0)}% of single-thread throughput.`,
      });
    } else if (last.efficiency !== null && last.efficiency < 0.5 && last.speedup >= 1) {
      out.push({
        kind: 'info',
        text: `${name(algorithm)} scaled sub-linearly: ${last.speedup.toFixed(2)}x speedup at ${last.threads} threads (${(last.efficiency * 100).toFixed(0)}% efficiency).`,
      });
    }
    const noisy = ms.filter((m) => (relativeError(m) ?? 0) > 0.1);
    if (noisy.length > 0) {
      out.push({
        kind: 'caution',
        text: `${name(algorithm)} varied by more than ±10% at ${noisy.map((m) => m.threads).join(', ')} thread(s); small differences there are noise.`,
      });
    }
  }
  if (maxThreads > report.environment.availableProcessors) {
    out.push({
      kind: 'caution',
      text: `Points above ${report.environment.availableProcessors} threads oversubscribe the CPUs; spin-lock results there reflect OS scheduling.`,
    });
  }
  return out;
}
