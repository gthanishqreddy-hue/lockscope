import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider } from '../app/AppState';
import { NAV } from '../app/Layout';
import { routes } from '../app/routes';
import { benchmarkReport, correctnessReport } from './fixtures';

// ECharts needs real layout; page tests check everything around the chart instead.
vi.mock('../components/Chart', () => ({
  Chart: ({ title }: { title: string }) => <div role="img" aria-label={title} />,
}));

const bundledBenchmark = { ...benchmarkReport(), origin: 'bundled-sample' as const };
const bundledCorrectness = { ...correctnessReport(), origin: 'bundled-sample' as const };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Serves bundled datasets; engine calls fail unless a handler is given. */
function mockFetch(engineHandler?: (url: string, init?: RequestInit) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('data/index.json')) {
      return jsonResponse({ datasets: [{ file: 'b.json' }, { file: 'c.json' }] });
    }
    if (url.endsWith('data/b.json')) return jsonResponse(bundledBenchmark);
    if (url.endsWith('data/c.json')) return jsonResponse(bundledCorrectness);
    if (engineHandler && url.includes('/api/v1/')) return engineHandler(url, init);
    throw new TypeError('Failed to fetch');
  });
}

function renderApp(path = '/', pollEngine = false) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppStateProvider pollEngine={pollEngine}>
      <RouterProvider router={router} />
    </AppStateProvider>,
  );
  return router;
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('navigation', () => {
  it('reaches every page from the sidebar', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderApp('/');
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });
    for (const item of NAV.flatMap((s) => s.items)) {
      await user.click(within(nav).getByRole('link', { name: item.label }));
      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading.textContent).toBeTruthy();
    }
  });

  it('shows a not-found page and breadcrumbs', async () => {
    mockFetch();
    renderApp('/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('LockScope');
  });
});

describe('datasets and labelling', () => {
  it('labels bundled data as bundled samples, never as live', async () => {
    mockFetch();
    renderApp('/results');
    const table = await screen.findByRole('table', { name: 'Measurements' });
    expect(within(table).getAllByText('Bundled sample').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Local engine run')).not.toBeInTheDocument();
  });

  it('shows the correctness report with the control caught', async () => {
    mockFetch();
    renderApp('/correctness');
    expect(await screen.findByText('Control caught')).toBeInTheDocument();
    expect(
      screen.getByText('Every real algorithm passed and every negative control was caught.'),
    ).toBeInTheDocument();
  });

  it('opens a dataset with its environment and reproduce command', async () => {
    mockFetch();
    renderApp(`/results/${encodeURIComponent(`bundled-sample:${bundledBenchmark.id}`)}`);
    expect(await screen.findByText('Environment')).toBeInTheDocument();
    expect(screen.getByText(bundledBenchmark.reproduceCommand)).toBeInTheDocument();
  });

  it('reports a failure to load bundled data without breaking the app', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    renderApp('/');
    expect(await screen.findByText(/Bundled datasets unavailable/)).toBeInTheDocument();
  });
});

describe('import', () => {
  it('rejects invalid files with a reason and accepts valid ones', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderApp('/results');
    const input = await screen.findByLabelText('Import result files');
    await user.upload(input, new File(['{"schema":"other"}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/bad.json: \$.schema: not a LockScope result file/)).toBeInTheDocument();

    const good = { ...benchmarkReport(), id: 'bench-20261030T000000Z-111111' };
    await user.upload(input, new File([JSON.stringify(good)], 'good.json', { type: 'application/json' }));
    await user.click(screen.getByRole('tab', { name: /Datasets/ }));
    expect(await screen.findByText('good.json')).toBeInTheDocument();
    expect(screen.getAllByText('Imported file').length).toBeGreaterThan(0);
  });
});

describe('engine states', () => {
  it('explains the local engine requirement when it is offline', async () => {
    mockFetch();
    renderApp('/benchmarks');
    expect(await screen.findByText(/Needs the local engine/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run on local engine/ })).toBeDisabled();
    expect(screen.getByText(/--args="bench --kind lock/)).toBeInTheDocument();
  });

  it('validates input as you type', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderApp('/benchmarks');
    const threads = await screen.findByLabelText('Thread counts');
    await user.clear(threads);
    await user.type(threads, '1,abc');
    expect(await screen.findByText(/Enter thread counts between 1 and/)).toBeInTheDocument();
    expect(screen.queryByText(/Needs the local engine/)).not.toBeInTheDocument();
  });

  it('runs an experiment against a connected engine and saves the result', async () => {
    const experiment = {
      id: 'test-20261030T000000Z-222222',
      type: 'CORRECTNESS',
      createdAt: '2026-10-30T00:00:00Z',
      startedAt: null,
      finishedAt: null,
      completedSteps: 0,
      totalSteps: 2,
      currentStep: null,
      error: null,
      cancelRequested: false,
      request: {},
      result: null,
    };
    const finished = {
      ...experiment,
      status: 'SUCCEEDED',
      completedSteps: 2,
      result: { ...correctnessReport(), id: 'test-20261030T000000Z-222222' },
    };
    mockFetch((url, init) => {
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok', version: '0.1.0', uptimeSeconds: 1 });
      if (url.endsWith('/capabilities')) {
        return jsonResponse({
          version: '0.1.0',
          benchmarks: true,
          correctness: true,
          cancellation: 'between steps',
          maxConcurrentExperiments: 1,
          queueCapacity: 4,
          queued: 0,
          maxThreads: 32,
          maxForks: 5,
          maxCorrectnessRuns: 20,
          persistence: 'in-memory',
          environment: {
            javaVersion: '17',
            javaVendor: 'x',
            vmName: 'x',
            osName: 'x',
            osArch: 'x',
            availableProcessors: 8,
            maxHeapMb: 1,
            jmhVersion: '1.37',
          },
          profiles: [],
        });
      }
      if (url.endsWith('/experiments') && init?.method === 'POST')
        return jsonResponse({ ...experiment, status: 'QUEUED' }, 202);
      if (url.includes('/experiments/')) return jsonResponse(finished);
      return jsonResponse({ experiments: [] });
    });
    const user = userEvent.setup();
    renderApp('/correctness', true);
    const run = await screen.findByRole('button', { name: /Run checks on local engine/ });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    expect(await screen.findByText('Open the saved result')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Experiment progress' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
  });

  it('surfaces engine validation errors', async () => {
    mockFetch((url) => {
      if (url.endsWith('/health')) return jsonResponse({ status: 'ok', version: '0.1.0', uptimeSeconds: 1 });
      if (url.endsWith('/capabilities'))
        return jsonResponse({ version: '0.1.0', environment: {}, profiles: [] });
      return jsonResponse({ error: { code: 'invalid_request', message: 'threads must be in [1, 32]' } }, 400);
    });
    const user = userEvent.setup();
    renderApp('/correctness', true);
    const run = await screen.findByRole('button', { name: /Run checks on local engine/ });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    expect(await screen.findByText('threads must be in [1, 32]')).toBeInTheDocument();
  });
});

describe('theme', () => {
  it('cycles through system, dark and light and persists the choice', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Theme: system/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('lockscope.theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: /Theme: dark/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: /Theme: light/ }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('simulations are labelled', () => {
  it('marks the visualizer trace as a deterministic demonstration', async () => {
    mockFetch();
    renderApp('/visualizer');
    expect(await screen.findByText(/not recorded from the JVM/)).toBeInTheDocument();
    expect(screen.getAllByText('Deterministic demo trace').length).toBeGreaterThan(0);
  });

  it('steps through a list operation in the data structure lab', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderApp('/sets');
    await user.click(await screen.findByRole('button', { name: 'remove' }));
    expect(screen.getAllByText('Browser simulation').length).toBeGreaterThan(0);
    expect(screen.getByText(/Step 1 \//)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText(/Step 2 \//)).toBeInTheDocument();
  });
});
