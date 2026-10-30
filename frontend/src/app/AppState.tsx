import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  datasetKey,
  loadBundled,
  loadStored,
  saveStored,
  type Dataset,
  type DatasetSource,
} from '../services/datasets';
import {
  DEFAULT_ENGINE_URL,
  engine,
  EngineError,
  shouldAutoDetectEngine,
  validateEngineUrl,
  type EngineCapabilities,
  type EngineHealth,
} from '../services/engineClient';
import { readStorage, STORAGE_KEYS, writeStorage } from '../services/storage';
import type { ResultReport } from '../schemas/results';

export type ThemePreference = 'system' | 'dark' | 'light';

export interface EngineState {
  state: 'checking' | 'connected' | 'disconnected';
  health?: EngineHealth;
  capabilities?: EngineCapabilities;
  error?: string;
  checkedAt?: string;
}

export interface Notice {
  id: number;
  tone: 'info' | 'success' | 'error';
  text: string;
}

interface AppStateValue {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  engineUrl: string;
  setEngineUrl: (url: string) => string | null;
  engineState: EngineState;
  refreshEngine: () => Promise<void>;
  datasets: Dataset[];
  bundledStatus: 'loading' | 'ready' | 'error';
  bundledError?: string;
  addDataset: (
    report: ResultReport,
    source: Exclude<DatasetSource, 'bundled-sample'>,
    fileName?: string,
  ) => Dataset;
  removeDataset: (key: string) => void;
  clearUserDatasets: () => void;
  storageOk: boolean;
  notices: Notice[];
  notify: (text: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const ENGINE_POLL_MS = 15_000;

/**
 * On a hosted copy of the dashboard most visitors have no engine, and probing 127.0.0.1 would log
 * failed requests and may trigger the browser's local-network permission prompt. Detection is
 * therefore automatic only when the dashboard itself runs locally, or after the visitor has
 * connected once (remembered in this browser).
 */
function engineDetectionEnabled(): boolean {
  return shouldAutoDetectEngine(window.location.hostname, readStorage(STORAGE_KEYS.engineOptIn) === '1');
}

const NOT_CHECKED =
  'this dashboard is hosted online, so it has not looked for a local engine yet. Use "Look for a local engine" to connect to one on this computer.';

/** Asks the engine for its health and capabilities; never throws. */
async function checkEngine(url: string): Promise<EngineState> {
  try {
    const health = await engine.health(url);
    const capabilities = await engine.capabilities(url);
    return { state: 'connected', health, capabilities, checkedAt: new Date().toISOString() };
  } catch (e) {
    return {
      state: 'disconnected',
      error: e instanceof EngineError ? e.message : 'Unknown error contacting the engine.',
      checkedAt: new Date().toISOString(),
    };
  }
}

function initialTheme(): ThemePreference {
  const saved = readStorage(STORAGE_KEYS.theme);
  return saved === 'dark' || saved === 'light' ? saved : 'system';
}

function initialEngineUrl(): string {
  const saved = readStorage(STORAGE_KEYS.engineUrl);
  return saved && validateEngineUrl(saved) === null ? saved : DEFAULT_ENGINE_URL;
}

export function AppStateProvider({
  children,
  pollEngine = true,
}: {
  children: ReactNode;
  pollEngine?: boolean;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [engineUrl, setEngineUrlState] = useState(initialEngineUrl);
  const [autoDetect, setAutoDetect] = useState(engineDetectionEnabled);
  const [engineState, setEngineState] = useState<EngineState>(() =>
    !pollEngine
      ? { state: 'disconnected', error: 'Engine checks are disabled.' }
      : autoDetect
        ? { state: 'checking' }
        : { state: 'disconnected', error: NOT_CHECKED },
  );
  const [bundled, setBundled] = useState<Dataset[]>([]);
  const [bundledStatus, setBundledStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bundledError, setBundledError] = useState<string>();
  const [userDatasets, setUserDatasets] = useState<Dataset[]>(loadStored);
  const [storageOk, setStorageOk] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeId = useRef(0);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    writeStorage(STORAGE_KEYS.theme, t === 'system' ? null : t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const notify = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    const id = ++noticeId.current;
    setNotices((n) => [...n.slice(-3), { id, tone, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), tone === 'error' ? 10_000 : 5_000);
  }, []);

  const dismissNotice = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  /**
   * User-triggered check: shows "checking" immediately, then the result. A successful check turns
   * on automatic detection for this browser.
   */
  const refreshEngine = useCallback(async () => {
    setEngineState((s) => ({ ...s, state: s.state === 'connected' ? 'connected' : 'checking' }));
    const next = await checkEngine(engineUrl);
    setEngineState(next);
    if (next.state === 'connected') {
      writeStorage(STORAGE_KEYS.engineOptIn, '1');
      setAutoDetect(true);
    }
  }, [engineUrl]);

  useEffect(() => {
    if (!pollEngine || !autoDetect) return undefined;
    let active = true;
    const poll = () => {
      void checkEngine(engineUrl).then((next) => {
        if (active) setEngineState(next);
      });
    };
    poll();
    const timer = setInterval(poll, ENGINE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [engineUrl, pollEngine, autoDetect]);

  const setEngineUrl = useCallback((url: string) => {
    const error = validateEngineUrl(url);
    if (error) return error;
    const normalized = new URL(url).origin;
    setEngineUrlState(normalized);
    writeStorage(STORAGE_KEYS.engineUrl, normalized === DEFAULT_ENGINE_URL ? null : normalized);
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadBundled(import.meta.env.BASE_URL)
      .then((d) => {
        if (cancelled) return;
        setBundled(d);
        setBundledStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBundledStatus('error');
        setBundledError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Dataset[]) => {
    setStorageOk(saveStored(next));
  }, []);

  const addDataset = useCallback(
    (report: ResultReport, source: Exclude<DatasetSource, 'bundled-sample'>, fileName?: string) => {
      const dataset: Dataset = {
        key: datasetKey(source, report),
        source,
        report,
        addedAt: new Date().toISOString(),
        fileName,
      };
      setUserDatasets((current) => {
        const next = [dataset, ...current.filter((d) => d.key !== dataset.key)];
        persist(next);
        return next;
      });
      return dataset;
    },
    [persist],
  );

  const removeDataset = useCallback(
    (key: string) =>
      setUserDatasets((current) => {
        const next = current.filter((d) => d.key !== key);
        persist(next);
        return next;
      }),
    [persist],
  );

  const clearUserDatasets = useCallback(() => {
    setUserDatasets([]);
    persist([]);
  }, [persist]);

  const datasets = useMemo(() => [...userDatasets, ...bundled], [userDatasets, bundled]);

  const value = useMemo<AppStateValue>(
    () => ({
      theme,
      setTheme,
      engineUrl,
      setEngineUrl,
      engineState,
      refreshEngine,
      datasets,
      bundledStatus,
      bundledError,
      addDataset,
      removeDataset,
      clearUserDatasets,
      storageOk,
      notices,
      notify,
      dismissNotice,
    }),
    [
      theme,
      setTheme,
      engineUrl,
      setEngineUrl,
      engineState,
      refreshEngine,
      datasets,
      bundledStatus,
      bundledError,
      addDataset,
      removeDataset,
      clearUserDatasets,
      storageOk,
      notices,
      notify,
      dismissNotice,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
