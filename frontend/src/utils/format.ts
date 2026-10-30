export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(2);
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return m < 60 ? `${m} min ${rest} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "ops/us" reads better as "ops/µs". */
export function formatUnit(unit: string): string {
  return unit.replace('/us', '/µs');
}
