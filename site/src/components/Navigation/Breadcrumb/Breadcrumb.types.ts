import type { ReactNode } from 'react';

/**
 * Breadcrumb item representing a single navigation level
 */
export interface BreadcrumbItem {
  /**
   * Display label for the breadcrumb: a name, or a label with its marks
   */
  label: ReactNode;

  /**
   * The route to open, as a router Link takes it; the last item and an item without one aren't links
   */
  to?: string;

  /**
   * The route's params
   */
  params?: Record<string, string>;

  /**
   * Shown on a phone too, where only the last item otherwise is
   */
  keep?: boolean;
}

/**
 * Props for the Breadcrumb component
 */
export interface BreadcrumbProps {
  /**
   * The trail, outermost first; the last item is the page shown
   */
  items: BreadcrumbItem[];

  /**
   * Additional CSS classes to apply to the breadcrumb container
   */
  className?: string;

  /**
   * Separator character/element between breadcrumb items
   * @default "/"
   */
  separator?: string;
}
