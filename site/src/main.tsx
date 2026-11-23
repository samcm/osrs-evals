import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotFound } from '@/components/Overlays/NotFound';
// TEMPORARY: Radix's tooltips in the pages not yet ported need its provider; goes with components/ui/
import { TooltipProvider } from '@/components/ui/tooltip';
import { parseSearch, stringifySearch } from '@/lib/search';
import './index.css';

const queryClient = new QueryClient();

// Whether the navigation being rendered changed the path. Tabs, filters and pages that only change search params keep
// the scroll position; a new page scrolls to the top, and back/forward restores it.
let pathChanged = true;

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultNotFoundComponent: NotFound,
  scrollRestoration: () => pathChanged,
  defaultPreload: 'intent', // preload on hover/touch
  defaultPreloadDelay: 50, // wait 50ms before preloading (prevents accidental hovers)
  defaultPreloadStaleTime: 0,
  // Plain query strings: lists comma-joined, no JSON; each route's validateSearch parses the values
  parseSearch,
  stringifySearch,
});

router.subscribe('onBeforeNavigate', event => {
  pathChanged = event.pathChanged;
});

// Register the router instance for type safety
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
