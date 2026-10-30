import type { RouteObject } from 'react-router';
import { Layout } from './Layout';
import { BenchmarkStudioPage } from '../pages/BenchmarkStudioPage';
import { ComparisonPage } from '../pages/ComparisonPage';
import { CorrectnessPage } from '../pages/CorrectnessPage';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { LearnPage } from '../pages/LearnPage';
import { LockLabPage } from '../pages/LockLabPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ResultsExplorerPage } from '../pages/ResultsExplorerPage';
import { SetLabPage } from '../pages/SetLabPage';
import { SettingsPage } from '../pages/SettingsPage';
import { VisualizerPage } from '../pages/VisualizerPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'locks', element: <LockLabPage /> },
      { path: 'sets', element: <SetLabPage /> },
      { path: 'correctness', element: <CorrectnessPage /> },
      { path: 'benchmarks', element: <BenchmarkStudioPage /> },
      { path: 'results', element: <ResultsExplorerPage /> },
      { path: 'results/:datasetKey', element: <DatasetDetailPage /> },
      { path: 'compare', element: <ComparisonPage /> },
      { path: 'visualizer', element: <VisualizerPage /> },
      { path: 'learn', element: <LearnPage /> },
      { path: 'learn/:topicId', element: <LearnPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
