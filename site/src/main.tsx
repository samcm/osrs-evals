import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { TooltipProvider } from './components/ui/tooltip';
import { parseSearch, stringifySearch } from './lib/search';
import './index.css';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  // Plain query strings: lists comma-joined, no JSON; each route's validateSearch parses the values
  parseSearch,
  stringifySearch,
});

// A shared link's ?theme= before the first paint, so it never flashes the stored theme
const linkTheme = new URLSearchParams(window.location.search).get('theme');
if (linkTheme === 'dark' || linkTheme === 'light')
  document.documentElement.classList.toggle('dark', linkTheme === 'dark');

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
);
