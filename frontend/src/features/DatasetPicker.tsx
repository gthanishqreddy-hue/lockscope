import { useId } from 'react';
import { SOURCE_LABEL } from '../services/datasets';
import type { BenchmarkDataset } from './useDatasets';

/** Select among benchmark datasets; the source is part of every option label. */
export function DatasetPicker({
  datasets,
  value,
  onChange,
  label = 'Dataset',
}: {
  datasets: BenchmarkDataset[];
  value: string | undefined;
  onChange: (key: string) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="field" style={{ minWidth: 260, maxWidth: 520 }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {datasets.map((d) => (
          <option key={d.key} value={d.key}>
            [{SOURCE_LABEL[d.source]}] {d.report.title} · {d.report.environment.availableProcessors} CPUs
          </option>
        ))}
      </select>
    </div>
  );
}
