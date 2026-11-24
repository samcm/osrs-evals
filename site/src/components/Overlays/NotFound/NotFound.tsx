import type { JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { buttonClassName } from '@/components/Elements/Button';

/**
 * NotFound component displays a 404 message when a route is not found, in the page's content area
 * (the sidebar and the breadcrumb bar stay), with a link to return to the home page.
 */
export function NotFound(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-6 py-24">
      <h1 className="text-2xl/8 font-semibold tracking-tight text-foreground">No page here</h1>
      <Link to="/" className={buttonClassName({ variant: 'primary' })}>
        Go home
      </Link>
    </div>
  );
}
