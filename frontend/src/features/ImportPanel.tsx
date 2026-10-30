import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { useAppState } from '../app/AppState';
import { Callout } from '../components/ui';
import { MAX_IMPORT_BYTES, parseResultText, SchemaError } from '../schemas/results';

/**
 * Imports engine result files. Files are read locally with FileReader, size-limited and
 * validated against the schema before anything is stored; nothing is uploaded.
 */
export function ImportPanel() {
  const { addDataset, notify, storageOk } = useAppState();
  const input = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const importFiles = async (files: FileList | File[]) => {
    const problems: string[] = [];
    let imported = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMPORT_BYTES) {
        problems.push(`${file.name}: larger than 10 MB`);
        continue;
      }
      if (!file.name.toLowerCase().endsWith('.json')) {
        problems.push(`${file.name}: only .json result files can be imported (CSV is an export format)`);
        continue;
      }
      try {
        const report = parseResultText(await file.text());
        addDataset(report, 'imported-file', file.name);
        imported++;
      } catch (e) {
        problems.push(`${file.name}: ${e instanceof SchemaError ? e.message : 'could not be read'}`);
      }
    }
    setErrors(problems);
    if (imported > 0) notify(`Imported ${imported} result file${imported === 1 ? '' : 's'}.`, 'success');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void importFiles(e.dataTransfer.files);
  };

  return (
    <div className="stack">
      <div
        className={`dropzone ${dragging ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>
          Drop <code>lockscope.benchmark/v1</code> or <code>lockscope.correctness/v1</code> JSON files here,
          or{' '}
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>
            <Upload size={14} aria-hidden /> choose files
          </button>
        </p>
        <p className="small muted" style={{ marginTop: 6 }}>
          Files stay in this browser. The engine writes them to <code>benchmark-results/local/</code>.
        </p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          aria-label="Import result files"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {errors.length > 0 && (
        <Callout tone="critical" title="Some files were not imported">
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Callout>
      )}
      {!storageOk && (
        <Callout tone="warning">
          Browser storage is unavailable or full, so imported results will be lost when you close this tab.
          Export what you want to keep.
        </Callout>
      )}
    </div>
  );
}
