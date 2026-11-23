import { type JSX, useEffect, useState, useMemo, useCallback } from 'react';
import { ThemeContext, type Theme } from '@/contexts/ThemeContext';

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force a specific theme via URL param - overrides user preference and localStorage */
  themeOverride?: Theme;
}

/** The page colour of each theme (--color-background), for the browser's own chrome; index.html has the same */
const THEME_COLORS: Record<Theme, string> = { light: '#f0f4f7', dark: '#0d1218' };

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  // Check localStorage first
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  // Fall back to system preference
  return getSystemTheme();
}

export function ThemeProvider({ children, themeOverride }: ThemeProviderProps): JSX.Element {
  // The stored preference, else the system's
  const [preferredTheme, setPreferredTheme] = useState<Theme>(getInitialTheme);

  // Determine effective theme - URL override takes precedence
  const effectiveTheme = themeOverride ?? preferredTheme;

  // Apply theme to document and update theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', effectiveTheme === 'dark');

    // Update theme-color meta tag for Safari/browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', THEME_COLORS[effectiveTheme]);
    }
  }, [effectiveTheme]);

  // Listen for system theme changes (only if no localStorage override and no URL override)
  useEffect(() => {
    if (themeOverride) return; // URL override active, don't listen to system changes

    const stored = localStorage.getItem('theme');
    if (stored) return; // User has explicit preference

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
      setPreferredTheme(getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeOverride]);

  const setTheme = useCallback((newTheme: Theme): void => {
    setPreferredTheme(newTheme);
    const systemTheme = getSystemTheme();

    // Only store if different from system preference
    if (newTheme !== systemTheme) {
      localStorage.setItem('theme', newTheme);
    } else {
      localStorage.removeItem('theme');
    }
  }, []);

  const clearTheme = useCallback((): void => {
    localStorage.removeItem('theme');
    setPreferredTheme(getSystemTheme());
  }, []);

  // Expose effective theme (with override applied) to consumers
  const value = useMemo(
    () => ({ theme: effectiveTheme, setTheme, clearTheme }),
    [effectiveTheme, setTheme, clearTheme]
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
