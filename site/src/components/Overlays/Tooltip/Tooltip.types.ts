import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  /** What the tooltip says; empty content (null, '', false) leaves the element without one */
  content: ReactNode;
  /** The element the tooltip belongs to; it receives the hover and focus handlers and the ref */
  children: ReactElement;
  /**
   * Which side of the element the tooltip opens on; it flips when there is no room there
   * @default 'top'
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Classes for the panel, such as a wider `max-w-*` for a long note */
  className?: string;
}

export interface TooltipGroupProps {
  children: ReactNode;
}
