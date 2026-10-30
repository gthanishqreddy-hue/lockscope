import { parseResultFile, type ResultReport } from '../schemas/results';

/**
 * Client for the optional local engine API (engine/server). Every call has a timeout and maps
 * failures to {@link EngineError}, so the UI can show a precise message instead of hanging.
 */

export const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8787';

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface EngineHealth {
  status: string;
  version: string;
  uptimeSeconds: number;
}

export interface EngineProfile {
  name: string;
  kind: 'lock' | 'set';
  description: string;
  defaults: {
    algorithms: string[];
    threadCounts: number[];
    criticalWork: number;
    nonCriticalWork: number;
    keyRange: number;
    readPercent: number;
  };
}

export interface EngineCapabilities {
  version: string;
  benchmarks: boolean;
  correctness: boolean;
  cancellation: string;
  maxConcurrentExperiments: number;
  queueCapacity: number;
  queued: number;
  maxThreads: number;
  maxForks: number;
  maxCorrectnessRuns: number;
  persistence: string;
  environment: {
    javaVersion: string;
    javaVendor: string;
    vmName: string;
    osName: string;
    osArch: string;
    availableProcessors: number;
    maxHeapMb: number;
    jmhVersion: string;
  };
  profiles: EngineProfile[];
}

export type ExperimentStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface Experiment {
  id: string;
  type: 'BENCHMARK' | 'CORRECTNESS';
  status: ExperimentStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  completedSteps: number;
  totalSteps: number;
  currentStep: string | null;
  error: string | null;
  cancelRequested: boolean;
  result: ResultReport | null;
}

export function isFinished(status: ExperimentStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
}

/** The engine binds to loopback only; refuse to send requests anywhere else. */
export function validateEngineUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Enter a full URL such as http://127.0.0.1:8787';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Use http:// or https://';
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    return 'The engine only runs on this computer: use 127.0.0.1 or localhost';
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return 'Enter only the origin, without a path';
  return null;
}

function normalize(base: string): string {
  return base.replace(/\/+$/, '');
}

async function request<T>(base: string, path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${normalize(base)}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new EngineError('The engine did not respond in time.', 'timeout');
    }
    // A refused connection and a CORS rejection look identical to the page, so name both causes.
    throw new EngineError(
      `Cannot reach the local engine at ${normalize(base)}. Start it with: cd engine && ./gradlew :server:run. ` +
        `If it is already running, allow this page with --allowed-origins ${window.location.origin}`,
      'unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new EngineError('The engine sent a response that is not JSON.', 'bad_response', response.status);
    }
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new EngineError(
      err?.message ?? `Request failed with HTTP ${response.status}`,
      err?.code ?? 'http_error',
      response.status,
    );
  }
  return body as T;
}

function toExperiment(raw: unknown): Experiment {
  const e = raw as Experiment & { result: unknown };
  return { ...e, result: e.result ? parseResultFile(e.result) : null };
}

export const engine = {
  health: (base: string) => request<EngineHealth>(base, '/health', {}, 3000),
  capabilities: (base: string) => request<EngineCapabilities>(base, '/capabilities'),
  listExperiments: async (base: string) =>
    (await request<{ experiments: unknown[] }>(base, '/experiments')).experiments.map(toExperiment),
  getExperiment: async (base: string, id: string) =>
    toExperiment(await request<unknown>(base, `/experiments/${encodeURIComponent(id)}`)),
  createExperiment: async (base: string, payload: Record<string, unknown>) =>
    toExperiment(
      await request<unknown>(base, '/experiments', { method: 'POST', body: JSON.stringify(payload) }),
    ),
  cancelExperiment: async (base: string, id: string) =>
    toExperiment(
      await request<unknown>(base, `/experiments/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    ),
};
