import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../app/AppState';
import { engine, EngineError, isFinished, type Experiment } from '../services/engineClient';
import type { Dataset } from '../services/datasets';

const POLL_MS = 1000;

/**
 * Submits an experiment to the local engine and follows it until it finishes. Progress comes
 * from the engine (completed points / checks); nothing here estimates or animates progress.
 */
export function useExperimentRunner() {
  const { engineUrl, addDataset, notify } = useAppState();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const follow = useCallback(
    (id: string) => {
      const poll = async () => {
        try {
          const e = await engine.getExperiment(engineUrl, id);
          if (!alive.current) return;
          setExperiment(e);
          if (isFinished(e.status)) {
            if (e.result) {
              setDataset(addDataset(e.result, 'live-engine'));
              notify(
                e.status === 'SUCCEEDED'
                  ? 'Experiment finished; results saved.'
                  : 'Experiment cancelled; partial results saved.',
                e.status === 'SUCCEEDED' ? 'success' : 'info',
              );
            } else if (e.status === 'FAILED') {
              notify(`Experiment failed: ${e.error ?? 'unknown error'}`, 'error');
            }
            return;
          }
          timer.current = setTimeout(() => void poll(), POLL_MS);
        } catch (err) {
          if (!alive.current) return;
          setError(err instanceof EngineError ? err.message : 'Lost contact with the engine.');
        }
      };
      void poll();
    },
    [engineUrl, addDataset, notify],
  );

  const start = useCallback(
    async (payload: Record<string, unknown>) => {
      setError(null);
      setDataset(null);
      setSubmitting(true);
      try {
        const e = await engine.createExperiment(engineUrl, payload);
        setExperiment(e);
        follow(e.id);
      } catch (err) {
        setError(err instanceof EngineError ? err.message : 'Could not start the experiment.');
      } finally {
        setSubmitting(false);
      }
    },
    [engineUrl, follow],
  );

  const cancel = useCallback(async () => {
    if (!experiment) return;
    try {
      setExperiment(await engine.cancelExperiment(engineUrl, experiment.id));
    } catch (err) {
      setError(err instanceof EngineError ? err.message : 'Could not cancel.');
    }
  }, [engineUrl, experiment]);

  const running = experiment !== null && !isFinished(experiment.status);
  return { experiment, error, submitting, running, dataset, start, cancel };
}
