import { Link } from 'react-router';
import { Callout, StatusText } from '../components/ui';
import type { Experiment } from '../services/engineClient';
import type { Dataset } from '../services/datasets';

/** Real progress of an engine experiment, as reported by the engine. */
export function ExperimentProgress({
  experiment,
  error,
  dataset,
  onCancel,
}: {
  experiment: Experiment | null;
  error: string | null;
  dataset: Dataset | null;
  onCancel: () => void;
}) {
  if (error) return <Callout tone="critical">{error}</Callout>;
  if (!experiment) return null;
  const pct = experiment.totalSteps > 0 ? (100 * experiment.completedSteps) / experiment.totalSteps : 0;
  const unit = experiment.type === 'BENCHMARK' ? 'points' : 'checks';
  return (
    <div className="stack" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          {experiment.status === 'QUEUED' && <StatusText tone="neutral">Queued</StatusText>}
          {experiment.status === 'RUNNING' && <StatusText tone="neutral">Running</StatusText>}
          {experiment.status === 'SUCCEEDED' && <StatusText tone="good">Finished</StatusText>}
          {experiment.status === 'CANCELLED' && <StatusText tone="warning">Cancelled</StatusText>}
          {experiment.status === 'FAILED' && <StatusText tone="critical">Failed</StatusText>}
        </span>
        <span className="small muted tabular">
          {experiment.completedSteps} / {experiment.totalSteps} {unit}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={experiment.totalSteps}
        aria-valuenow={experiment.completedSteps}
        aria-label="Experiment progress"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      {experiment.currentStep && <span className="small secondary">Now: {experiment.currentStep}</span>}
      {experiment.status === 'FAILED' && experiment.error && (
        <Callout tone="critical">{experiment.error}</Callout>
      )}
      {(experiment.status === 'RUNNING' || experiment.status === 'QUEUED') && (
        <div>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={onCancel}
            disabled={experiment.cancelRequested}
          >
            {experiment.cancelRequested ? 'Cancelling after the current step…' : 'Cancel'}
          </button>
        </div>
      )}
      {dataset && (
        <Link className="small" to={`/results/${encodeURIComponent(dataset.key)}`}>
          Open the saved result
        </Link>
      )}
    </div>
  );
}
