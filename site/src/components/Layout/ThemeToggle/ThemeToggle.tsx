import { type JSX } from 'react';
import { MoonIcon, SunIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/contexts/ThemeContext';
import { Tooltip } from '@/components/Overlays/Tooltip';
import { useSearchUpdate } from '@/lib/search';

/** The theme each click moves to */
const NEXT_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'star', star: 'light' };

const THEME_LABELS: Record<Theme, string> = { light: 'Light theme', dark: 'Dark theme', star: 'Star theme' };

/**
 * ThemeToggle component that cycles through light, dark, and star themes.
 *
 * Displays the current theme icon and cycles to the next theme on click:
 * light -> dark -> star -> light. A click is the reader's own choice, so it also drops a shared
 * link's `?theme=`, which would otherwise keep overriding it.
 */
export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const update = useSearchUpdate<{ theme?: Theme }>();

  const cycleTheme = (): void => {
    setTheme(NEXT_THEME[theme]);
    update({ theme: undefined });
  };

  const getThemeIcon = (): JSX.Element => {
    switch (theme) {
      case 'light':
        return <SunIcon className="size-5 text-warning" />;
      case 'dark':
        return <MoonIcon className="size-5 text-primary" />;
      case 'star':
        return <SparklesIcon className="size-5 text-primary" />;
    }
  };

  return (
    <Tooltip content={THEME_LABELS[theme]} side="bottom">
      <button
        type="button"
        onClick={cycleTheme}
        className="flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-primary-10 hover:text-primary"
        aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to cycle themes.`}
      >
        {getThemeIcon()}
      </button>
    </Tooltip>
  );
}
