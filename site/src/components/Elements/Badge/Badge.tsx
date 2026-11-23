import { type JSX } from 'react';
import clsx from 'clsx';
import type { BadgeProps, BadgeColor, BadgeVariant } from './Badge.types';

interface ColorClasses {
  border: string;
  flat: string;
  dotFill: string;
  removeButton: {
    hover: string;
    stroke: string;
  };
}

/** gray is the neutral badge; green, orange and red are status colours and use the theme's status tokens */
const colorStyles: Record<BadgeColor, ColorClasses> = {
  gray: {
    border: 'bg-surface text-muted inset-ring inset-ring-border',
    flat: 'bg-muted-10 text-muted',
    dotFill: 'fill-muted',
    removeButton: {
      hover: 'hover:bg-muted-20',
      stroke: 'stroke-muted-50 group-hover:stroke-muted',
    },
  },
  red: {
    border: 'bg-danger-10 text-danger inset-ring inset-ring-danger-20',
    flat: 'bg-danger-15 text-danger',
    dotFill: 'fill-danger',
    removeButton: {
      hover: 'hover:bg-danger-20',
      stroke: 'stroke-danger-50 group-hover:stroke-danger-75',
    },
  },
  orange: {
    border: 'bg-warning-10 text-warning inset-ring inset-ring-warning-20',
    flat: 'bg-warning-15 text-warning',
    dotFill: 'fill-warning',
    removeButton: {
      hover: 'hover:bg-warning-20',
      stroke: 'stroke-warning-50 group-hover:stroke-warning-75',
    },
  },
  green: {
    border: 'bg-success-10 text-success inset-ring inset-ring-success-20',
    flat: 'bg-success-15 text-success',
    dotFill: 'fill-success',
    removeButton: {
      hover: 'hover:bg-success-20',
      stroke: 'stroke-success-50 group-hover:stroke-success-75',
    },
  },
};

// Special styling for dot badges with border variant
const dotBorderClasses = 'text-foreground inset-ring inset-ring-border';

export function Badge({
  children,
  color = 'gray',
  variant = 'border',
  size = 'default',
  pill = false,
  dot = false,
  onRemove,
  truncate = false,
  className,
}: BadgeProps): JSX.Element {
  const styles = colorStyles[color];
  const hasDot = dot;
  const hasRemoveButton = !!onRemove;

  // Base classes
  const baseClasses = 'inline-flex items-center text-xs font-medium';

  // Size classes
  const sizeClasses = size === 'small' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  // Shape classes
  const shapeClasses = pill ? 'rounded-full' : 'rounded-xs';

  // Gap classes
  const gapClasses = hasDot ? 'gap-x-1.5' : hasRemoveButton ? 'gap-x-0.5' : '';

  // Color and variant classes
  const colorClasses = getColorClasses(variant, styles, hasDot);

  // Truncate classes
  const truncateClasses = truncate ? 'max-w-32 truncate' : '';

  return (
    <span
      className={clsx(baseClasses, sizeClasses, shapeClasses, gapClasses, colorClasses, truncateClasses, className)}
    >
      {hasDot && (
        <svg viewBox="0 0 6 6" aria-hidden="true" className={clsx('size-1.5', styles.dotFill)}>
          <circle r={3} cx={3} cy={3} />
        </svg>
      )}
      {children}
      {hasRemoveButton && (
        <button
          type="button"
          onClick={onRemove}
          className={clsx('group relative -mr-1 size-3.5 rounded-xs', styles.removeButton.hover)}
        >
          <span className="sr-only">Remove</span>
          <svg viewBox="0 0 14 14" className={clsx('size-3.5', styles.removeButton.stroke)}>
            <path d="M4 4l6 6m0-6l-6 6" />
          </svg>
          <span className="absolute -inset-1" />
        </button>
      )}
    </span>
  );
}

function getColorClasses(variant: BadgeVariant, styles: ColorClasses, hasDot: boolean): string {
  // When using dot with border variant, use neutral colors with inset-ring
  if (hasDot && variant === 'border') {
    return dotBorderClasses;
  }

  // When using dot with flat variant, use the regular flat styles (no special treatment needed)
  // Otherwise use the appropriate variant styles
  return variant === 'border' ? styles.border : styles.flat;
}
