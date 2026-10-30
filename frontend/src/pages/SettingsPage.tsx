import { useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { useAppState, type ThemePreference } from '../app/AppState';
import { Callout, Card, CopyBlock, PageHeader, Segmented, StatusText, TextField } from '../components/ui';
import { DEFAULT_ENGINE_URL } from '../services/engineClient';
import { downloadText } from '../utils/csv';
import { formatDate } from '../utils/format';

/** Set VITE_REPO_URL at build time to link the documentation in your published repository. */
const REPO_URL: string | undefined = import.meta.env.VITE_REPO_URL;

export function SettingsPage() {
  const {
    theme,
    setTheme,
    engineUrl,
    setEngineUrl,
    engineState,
    refreshEngine,
    datasets,
    clearUserDatasets,
    storageOk,
    notify,
  } = useAppState();
  const [urlDraft, setUrlDraft] = useState(engineUrl);
  const [urlError, setUrlError] = useState<string>();
  const userDatasets = datasets.filter((d) => d.source !== 'bundled-sample');
  const caps = engineState.capabilities;

  const exportAll = () => {
    downloadText(
      'lockscope-my-results.json',
      JSON.stringify(
        { exportedAt: new Date().toISOString(), reports: userDatasets.map((d) => d.report) },
        null,
        2,
      ),
      'application/json',
    );
  };

  return (
    <>
      <PageHeader
        title="Settings and environment"
        description="Appearance, the connection to your local engine, and the data stored in this browser."
      />
      <div className="grid grid-2">
        <Card title="Appearance">
          <div className="stack">
            <Segmented<ThemePreference>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
            <p className="small muted">
              Saved in this browser when storage is available. Animations follow your reduced-motion setting.
            </p>
          </div>
        </Card>
        <Card title="About this build">
          <dl className="kv">
            <dt>Dashboard version</dt>
            <dd>{__APP_VERSION__}</dd>
            <dt>Commit</dt>
            <dd className="mono">{__GIT_COMMIT__}</dd>
            <dt>Built</dt>
            <dd>{formatDate(__BUILD_TIME__)}</dd>
            <dt>Mode</dt>
            <dd>
              {engineState.state === 'connected'
                ? 'Static dashboard + local engine'
                : 'Static (no engine connected)'}
            </dd>
            <dt>Documentation</dt>
            <dd>
              {REPO_URL ? (
                <a href={`${REPO_URL}/tree/main/docs`} target="_blank" rel="noreferrer noopener">
                  docs/ in the repository
                </a>
              ) : (
                <span>the docs/ folder of the repository</span>
              )}
            </dd>
          </dl>
        </Card>
      </div>

      <Card
        title="Local engine"
        description="The Java engine runs on your own computer and serves an API on the loopback interface only."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => void refreshEngine()}>
            <RefreshCw size={14} aria-hidden /> Check now
          </button>
        }
      >
        <div className="stack">
          <div className="row">
            {engineState.state === 'connected' ? (
              <StatusText tone="good">Connected to {engineUrl}</StatusText>
            ) : engineState.state === 'checking' ? (
              <StatusText tone="neutral">Checking {engineUrl}…</StatusText>
            ) : (
              <StatusText tone="neutral">Not connected: {engineState.error}</StatusText>
            )}
            {engineState.checkedAt && (
              <span className="small muted">last checked {formatDate(engineState.checkedAt)}</span>
            )}
          </div>
          <form
            className="row"
            style={{ alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              const error = setEngineUrl(urlDraft.trim());
              setUrlError(error ?? undefined);
              if (!error) notify('Engine address saved.', 'success');
            }}
          >
            <div style={{ flex: 1, minWidth: 220, maxWidth: 380 }}>
              <TextField
                label="Engine address"
                value={urlDraft}
                onChange={setUrlDraft}
                error={urlError}
                hint={`Default ${DEFAULT_ENGINE_URL}`}
              />
            </div>
            <button type="submit" className="btn">
              Save
            </button>
          </form>
          {caps ? (
            <div className="grid grid-2">
              <dl className="kv">
                <dt>Engine version</dt>
                <dd>{caps.version}</dd>
                <dt>Java</dt>
                <dd>
                  {caps.environment.javaVersion} ({caps.environment.javaVendor}, {caps.environment.vmName})
                </dd>
                <dt>OS</dt>
                <dd>
                  {caps.environment.osName} ({caps.environment.osArch})
                </dd>
                <dt>CPUs / heap</dt>
                <dd>
                  {caps.environment.availableProcessors} / {caps.environment.maxHeapMb} MB
                </dd>
                <dt>JMH</dt>
                <dd>{caps.environment.jmhVersion}</dd>
              </dl>
              <dl className="kv">
                <dt>Benchmarks / checks</dt>
                <dd>
                  {caps.benchmarks ? 'yes' : 'no'} / {caps.correctness ? 'yes' : 'no'}
                </dd>
                <dt>Runs at a time</dt>
                <dd>
                  {caps.maxConcurrentExperiments} (queue of {caps.queueCapacity}, {caps.queued} waiting)
                </dd>
                <dt>Limits</dt>
                <dd>
                  ≤ {caps.maxThreads} threads, ≤ {caps.maxForks} forks
                </dd>
                <dt>Cancellation</dt>
                <dd>{caps.cancellation}</dd>
                <dt>Persistence</dt>
                <dd>{caps.persistence}</dd>
              </dl>
            </div>
          ) : (
            <div className="stack">
              <p className="secondary">Start the engine from the repository root (Java 17 or newer):</p>
              <CopyBlock text="cd engine && ./gradlew :server:run" />
              <p className="small muted">
                If this dashboard is served from somewhere other than localhost:5173 or :4173, allow its
                origin explicitly, for example{' '}
                <code>./gradlew :server:run --args="--allowed-origins https://your-site.pages.dev"</code>.
                Some browsers block public sites from calling localhost; running the dashboard locally always
                works.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Data in this browser"
        description="Imported files and engine results are kept in local storage on this device only. Nothing is sent anywhere."
      >
        <div className="stack">
          {!storageOk && (
            <Callout tone="warning">
              Browser storage is unavailable or full; results will be lost when this tab closes.
            </Callout>
          )}
          <p>
            {userDatasets.length} saved dataset{userDatasets.length === 1 ? '' : 's'} (bundled samples are not
            counted).
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={exportAll}
              disabled={userDatasets.length === 0}
            >
              <Download size={14} aria-hidden /> Export all
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={userDatasets.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${userDatasets.length} saved dataset(s) from this browser? Export first if you want to keep them.`,
                  )
                ) {
                  clearUserDatasets();
                  notify('Saved datasets removed from this browser.');
                }
              }}
            >
              <Trash2 size={14} aria-hidden /> Remove all
            </button>
          </div>
          <p className="small muted">LockScope uses no analytics, cookies or third-party services.</p>
        </div>
      </Card>
    </>
  );
}
