/** RFC 4180 CSV with spreadsheet-formula neutralization (mirrors the engine's ResultIO). */

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value === 'string' && s.length > 0 && '=+-@'.includes(s.charAt(0))) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/** Offers text to the user as a file download. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
