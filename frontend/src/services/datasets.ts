import { parseResultFile, type ResultReport } from '../schemas/results';
import { readStorage, STORAGE_KEYS, writeStorage } from './storage';

/**
 * Where a dataset came from. This is shown on every chart and table that uses it, so measured
 * data from the bundled samples, a user's file and the live engine are never confused.
 */
export type DatasetSource = 'bundled-sample' | 'imported-file' | 'live-engine';

export interface Dataset {
  key: string;
  source: DatasetSource;
  report: ResultReport;
  addedAt: string;
  fileName?: string;
  description?: string;
}

export const SOURCE_LABEL: Record<DatasetSource, string> = {
  'bundled-sample': 'Bundled sample',
  'imported-file': 'Imported file',
  'live-engine': 'Local engine run',
};

export const SOURCE_DESCRIPTION: Record<DatasetSource, string> = {
  'bundled-sample':
    'Real measurements shipped with the dashboard, recorded once on the machine listed in the environment details. Not live.',
  'imported-file': 'A result file you imported from your own engine run. Stored only in this browser.',
  'live-engine':
    'Produced by the local engine connected to this dashboard during this or an earlier session.',
};

export function datasetKey(source: DatasetSource, report: ResultReport): string {
  return `${source}:${report.id}`;
}

interface BundledIndex {
  datasets: { file: string; description?: string }[];
}

/** Loads the measured datasets shipped in public/data. */
export async function loadBundled(baseUrl: string): Promise<Dataset[]> {
  const response = await fetch(`${baseUrl}data/index.json`);
  if (!response.ok) throw new Error(`Could not load bundled datasets (HTTP ${response.status})`);
  const index = (await response.json()) as BundledIndex;
  const loaded = await Promise.all(
    index.datasets.map(async (entry) => {
      const r = await fetch(`${baseUrl}data/${encodeURIComponent(entry.file)}`);
      if (!r.ok) throw new Error(`Could not load ${entry.file} (HTTP ${r.status})`);
      const report = parseResultFile(await r.json());
      const dataset: Dataset = {
        key: datasetKey('bundled-sample', report),
        source: 'bundled-sample',
        report,
        addedAt: report.createdAt,
        fileName: entry.file,
        description: entry.description,
      };
      return dataset;
    }),
  );
  return loaded;
}

const MAX_STORED_CHARS = 4_000_000;

/** User datasets (imported or from the engine) persisted in this browser, when storage allows. */
export function loadStored(): Dataset[] {
  const raw = readStorage(STORAGE_KEYS.datasets);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      source: DatasetSource;
      addedAt: string;
      fileName?: string;
      report: unknown;
    }[];
    const out: Dataset[] = [];
    for (const d of parsed) {
      if (d.source !== 'imported-file' && d.source !== 'live-engine') continue;
      try {
        const report = parseResultFile(d.report);
        out.push({
          key: datasetKey(d.source, report),
          source: d.source,
          report,
          addedAt: d.addedAt,
          fileName: d.fileName,
        });
      } catch {
        // Skip entries that no longer validate rather than losing the rest.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Returns false when the datasets were too large or storage is unavailable. */
export function saveStored(datasets: Dataset[]): boolean {
  const user = datasets
    .filter((d) => d.source !== 'bundled-sample')
    .map((d) => ({ source: d.source, addedAt: d.addedAt, fileName: d.fileName, report: d.report }));
  const text = JSON.stringify(user);
  if (text.length > MAX_STORED_CHARS) return false;
  return writeStorage(STORAGE_KEYS.datasets, text);
}
