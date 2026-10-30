import { Link } from 'react-router';
import { useAppState } from '../app/AppState';
import { Callout, CopyBlock } from '../components/ui';

/**
 * Explains, wherever an action needs the local Java engine, why it is unavailable and how to
 * get the same result without it.
 */
export function EngineNotice({ command, what }: { command?: string; what: string }) {
  const { engineState, refreshEngine } = useAppState();
  if (engineState.state === 'connected') return null;
  return (
    <div className="stack">
      <Callout tone="info" title="Needs the local engine">
        {what} runs in the Java engine on your own computer; this dashboard never runs it remotely.{' '}
        {engineState.state === 'checking'
          ? 'Checking for a running engine…'
          : 'No engine is reachable right now.'}{' '}
        Start it with <code>cd engine && ./gradlew :server:run</code> (see{' '}
        <Link to="/settings">Settings</Link>), or run the same experiment from the command line and import the
        JSON file it writes in the Results Explorer.
      </Callout>
      {engineState.state !== 'checking' && (
        <div>
          <button type="button" className="btn btn-sm" onClick={() => void refreshEngine()}>
            Look for a local engine
          </button>
        </div>
      )}
      {command && <CopyBlock text={command} label="Copy the equivalent CLI command" />}
    </div>
  );
}
