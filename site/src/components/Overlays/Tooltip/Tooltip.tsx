import { cloneElement, useId, useState, type JSX, type Ref } from 'react';
import {
  FloatingDelayGroup,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDelayGroup,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  useTransitionStyles,
} from '@floating-ui/react';
import clsx from 'clsx';
import type { TooltipGroupProps, TooltipProps } from './Tooltip.types';

/** How long the pointer rests on an element before its tooltip opens, outside a group's instant phase */
const OPEN_DELAY = 200;
/** One fade, the site's one motion speed */
const FADE_MS = 150;

/**
 * Lets the pointer move between tooltips without waiting again: once one has opened, the next opens
 * at once and the last one closes without a fade. Mounted once around the app.
 *
 * @example
 * ```tsx
 * <TooltipGroup>
 *   <App />
 * </TooltipGroup>
 * ```
 */
export function TooltipGroup({ children }: TooltipGroupProps): JSX.Element {
  return (
    <FloatingDelayGroup delay={{ open: OPEN_DELAY, close: 100 }} timeoutMs={300}>
      {children}
    </FloatingDelayGroup>
  );
}

/**
 * Says more about an element on hover or focus, in a panel styled as lab's PopoverPanel (surface,
 * hairline outline, small type). Lab has no tooltip component; this one exists because hover text
 * is never the browser's `title`. Positioned by Floating UI (Headless UI's own engine): it opens
 * after a short rest, already in place, and fades in; it flips and shifts to stay on screen.
 *
 * The child is the trigger itself (no wrapper element), so it must accept a ref and DOM handlers.
 * Without content it renders the child alone.
 *
 * @example
 * ```tsx
 * <Tooltip content="1,204 ticks">
 *   <span>12m 2s</span>
 * </Tooltip>
 * ```
 */
export function Tooltip({ content, children, side = 'top', className, open }: TooltipProps): JSX.Element {
  if (content == null || content === '' || content === false) return children;
  return (
    <FloatingTooltip content={content} side={side} className={className} open={open}>
      {children}
    </FloatingTooltip>
  );
}

function FloatingTooltip({ content, children, side, className, open: held }: TooltipProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const open = held ?? hovered;
  const id = useId();
  const {
    refs: { setReference, setFloating },
    floatingStyles,
    context,
    isPositioned,
  } = useFloating({
    open,
    onOpenChange: setHovered,
    placement: side,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const group = useDelayGroup(context, { id });
  // Outside a TooltipGroup the group's delay is 0; keep the short rest there too
  const delay = group.delay === 0 ? { open: OPEN_DELAY, close: 0 } : group.delay;
  const hover = useHover(context, { delay, move: false });
  const focus = useFocus(context);
  // A click on the element closes its tooltip, as it does a native one
  const dismiss = useDismiss(context, { referencePress: true });
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const { isMounted, styles } = useTransitionStyles(context, {
    duration: group.isInstantPhase ? { open: 0, close: group.currentId === id ? FADE_MS : 0 } : FADE_MS,
    initial: { opacity: 0 },
  });

  // The child's own ref (a prop in React 19) still reaches it
  const childProps = children.props as { ref?: Ref<Element> } & Record<string, unknown>;
  const setTrigger = useMergeRefs([setReference, childProps.ref]);
  return (
    <>
      {/* The trigger is the child itself, as Radix's asChild: a wrapper element would change table and flex layouts */}
      {/* eslint-disable-next-line @eslint-react/no-clone-element */}
      {cloneElement(children, getReferenceProps({ ...childProps, ref: setTrigger }))}
      {isMounted && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={{ ...floatingStyles, ...styles }}
            className={clsx(
              'pointer-events-none z-60 w-max max-w-xs rounded-sm bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-sm',
              'outline-1 -outline-offset-1 outline-border',
              // Held invisible until Floating UI has placed it, so it never flashes at the corner
              !isPositioned && 'invisible',
              className
            )}
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
