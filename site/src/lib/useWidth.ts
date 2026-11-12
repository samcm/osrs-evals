import { useCallback, useState } from 'react';

/** The width of an element, kept current with a ResizeObserver. Use the callback as its ref. */
export function useWidth(): [(node: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
