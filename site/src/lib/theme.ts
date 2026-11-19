/**
 * Light and dark, following the system until the reader picks one (as lab does). The theme is the
 * `dark` class on <html>, set before React mounts by index.html; tokens switch with it. A `?theme=`
 * in the URL overrides the stored choice for that view (see setThemeOverride).
 */

import { useMemo, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_COLORS: Record<Theme, string> = { light: '#efeee5', dark: '#0f0f0e' };

/** The theme from the URL, when a link sets one */
let override: Theme | undefined;

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme to show: the URL's, else the stored choice, else the system's. */
function wantedTheme(): Theme {
  const stored = localStorage.getItem('theme');
  return override ?? (stored === 'dark' || stored === 'light' ? stored : systemTheme());
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = (): void => {
    applyTheme(wantedTheme());
  };
  media.addEventListener('change', onSystem);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onSystem);
  };
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** Pick a theme as the reader's preference; picking the system's own clears the stored choice. */
export function setTheme(theme: Theme): void {
  if (theme === systemTheme()) localStorage.removeItem('theme');
  else localStorage.setItem('theme', theme);
  override = undefined;
  applyTheme(theme);
}

/** Show the URL's `?theme=` (or, when undefined, the preference) without storing it. */
export function setThemeOverride(theme: Theme | undefined): void {
  override = theme;
  applyTheme(wantedTheme());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}

/** Resolve a colour token to rgb() for the canvas, which cannot read oklch or light-dark(). */
let probe: HTMLSpanElement | null = null;
let context: CanvasRenderingContext2D | null = null;

export function resolveToken(token: string): string {
  if (!probe) {
    probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  }
  probe.style.color = `var(${token})`;
  const computed = getComputedStyle(probe).color;
  if (!context) return computed;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#000';
  context.fillStyle = computed;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export interface ThemeColors {
  theme: Theme;
  primary: string;
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
  success: string;
  warning: string;
  danger: string;
  /** Resolve any token, such as a series colour, for the active theme */
  resolve: (token: string) => string;
}

/** Theme colours as rgb strings for charts; recomputed when the theme changes. */
export function useThemeColors(): ThemeColors {
  const theme = useTheme();
  return useMemo(() => {
    const cache = new Map<string, string>();
    const resolve = (token: string): string => {
      let value = cache.get(token);
      if (!value) {
        value = resolveToken(token);
        cache.set(token, value);
      }
      return value;
    };
    return {
      theme,
      primary: resolve('--color-primary'),
      background: resolve('--color-background'),
      surface: resolve('--color-surface'),
      border: resolve('--color-border'),
      foreground: resolve('--color-foreground'),
      muted: resolve('--color-muted'),
      success: resolve('--color-success'),
      warning: resolve('--color-warning'),
      danger: resolve('--color-danger'),
      resolve,
    };
  }, [theme]);
}

/** A colour at part of its strength, for the canvas. */
export function withAlpha(rgb: string, alpha: number): string {
  const m = rgb.match(/rgba?\((\d+), (\d+), (\d+)/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : rgb;
}
