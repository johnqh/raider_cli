import { lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Home } from './pages/Home';

const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Stats = lazy(() => import('./pages/Stats'));

const wrap = (node: ReactNode) => <Suspense fallback={<p>loading</p>}>{node}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/users', element: wrap(<Users />) },
  { path: '/users/:id', element: wrap(<UserDetail />) },
  { path: '/stats', element: wrap(<Stats />) },
]);

// Exposed so the capture probe can read the real route table.
(globalThis as unknown as Record<string, unknown>).__reactRouterDataRouter = router;

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
