import { type JSX } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/20/solid';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip } from '@/components/Overlays/Tooltip';
import { useSearchUpdate } from '@/lib/search';
import type { Theme } from '@/contexts/ThemeContext';

/**
 * Switches between the light and dark themes. It shows the theme a click moves to, in the chrome's
 * neutral colour. A click is the reader's own choice, so it also drops a shared link's `?theme=`,
 * which would otherwise keep overriding it.
 */
export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const update = useSearchUpdate<{ theme?: Theme }>();
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  const label = next === 'dark' ? 'Dark theme' : 'Light theme';
  const Icon = next === 'dark' ? MoonIcon : SunIcon;

  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        onClick={() => {
          setTheme(next);
          update({ theme: undefined });
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-foreground-5 hover:text-foreground"
        aria-label={`Switch to the ${next} theme`}
      >
        <Icon className="size-5" />
      </button>
    </Tooltip>
  );
}
