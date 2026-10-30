import type { BenchmarkReport } from '../schemas/results';

export interface ComparabilityIssue {
  severity: 'blocking' | 'warning';
  message: string;
}

/**
 * Checks whether benchmark reports can be compared point-for-point. "Blocking" issues make the
 * numbers meaningless side by side (different units or workloads); "warning" issues weaken the
 * comparison (different machine, runtime or measurement settings).
 */
export function comparabilityIssues(reports: BenchmarkReport[]): ComparabilityIssue[] {
  const issues: ComparabilityIssue[] = [];
  const [first, ...rest] = reports;
  if (!first) return issues;
  for (const r of rest) {
    const label = `"${r.title}"`;
    if (r.kind !== first.kind) {
      issues.push({
        severity: 'blocking',
        message: `${label} benchmarks ${r.kind}s, the first benchmarks ${first.kind}s.`,
      });
      continue;
    }
    if (
      r.methodology.mode !== first.methodology.mode ||
      r.methodology.scoreUnit !== first.methodology.scoreUnit
    ) {
      issues.push({
        severity: 'blocking',
        message: `${label} uses ${r.methodology.mode} (${r.methodology.scoreUnit}), the first uses ${first.methodology.mode} (${first.methodology.scoreUnit}).`,
      });
    }
    const w = r.workload;
    const f = first.workload;
    const workloadDiffs: string[] = [];
    if (w.criticalWork !== f.criticalWork)
      workloadDiffs.push(`critical work ${w.criticalWork} vs ${f.criticalWork}`);
    if (w.nonCriticalWork !== f.nonCriticalWork)
      workloadDiffs.push(`non-critical work ${w.nonCriticalWork} vs ${f.nonCriticalWork}`);
    if (w.keyRange !== f.keyRange) workloadDiffs.push(`key range ${w.keyRange} vs ${f.keyRange}`);
    if (w.readPercent !== f.readPercent) workloadDiffs.push(`read % ${w.readPercent} vs ${f.readPercent}`);
    if (workloadDiffs.length > 0) {
      issues.push({
        severity: 'blocking',
        message: `${label} has a different workload: ${workloadDiffs.join(', ')}.`,
      });
    }
    const e = r.environment;
    const fe = first.environment;
    const envDiffs: string[] = [];
    if (e.availableProcessors !== fe.availableProcessors)
      envDiffs.push(`${e.availableProcessors} vs ${fe.availableProcessors} CPUs`);
    if (e.osName !== fe.osName || e.osArch !== fe.osArch)
      envDiffs.push(`${e.osName}/${e.osArch} vs ${fe.osName}/${fe.osArch}`);
    if (e.javaVersion !== fe.javaVersion) envDiffs.push(`Java ${e.javaVersion} vs ${fe.javaVersion}`);
    if (e.vmName !== fe.vmName) envDiffs.push(`${e.vmName} vs ${fe.vmName}`);
    if (envDiffs.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${label} ran in a different environment: ${envDiffs.join(', ')}.`,
      });
    }
    const m = r.methodology;
    const fm = first.methodology;
    if (
      m.forks !== fm.forks ||
      m.warmupIterations !== fm.warmupIterations ||
      m.warmupMillis !== fm.warmupMillis ||
      m.measurementIterations !== fm.measurementIterations ||
      m.measurementMillis !== fm.measurementMillis
    ) {
      issues.push({
        severity: 'warning',
        message: `${label} used different warm-up, measurement or fork settings.`,
      });
    }
  }
  return issues;
}
