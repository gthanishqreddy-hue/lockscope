import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppStateProvider } from './app/AppState';
import { routes } from './app/routes';
import './styles/global.css';

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
    </AppStateProvider>
  </StrictMode>,
);
