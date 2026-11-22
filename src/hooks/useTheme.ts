import { useCallback, useEffect, useState } from 'react';

export type ThemeOverride = 'light' | 'dark' | null;

function getMetaTag(): HTMLMetaElement | null {
  return document.querySelector('meta[name="color-scheme"]');
}

function readStoredOverride(): ThemeOverride {
  try {
    const val = localStorage.getItem('color-scheme');
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [override, setOverride] = useState<ThemeOverride>(() => readStoredOverride());
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark());

  const resolvedTheme: 'light' | 'dark' =
    override ?? (systemDark ? 'dark' : 'light');

  // Keep <meta name="color-scheme"> synchronized with override (or 'light dark' when following system)
  useEffect(() => {
    const meta = getMetaTag();
    if (meta) {
      meta.content = override ?? 'light dark';
    }
  }, [override]);

  // Listen to OS color scheme changes and cross-tab localStorage updates
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMqChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onMqChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') {
        const next = e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : null;
        setOverride(next);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mq.removeEventListener('change', onMqChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /**
   * Two-state toggle per modern-web-guidance:
   * - Target = opposite of currently rendered scheme.
   * - If target matches system preference, remove stored override so site tracks OS again.
   * - Otherwise persist target literally.
   */
  const toggleTheme = useCallback(() => {
    const currentRendered: 'light' | 'dark' =
      override ?? (systemDark ? 'dark' : 'light');
    const target: 'light' | 'dark' = currentRendered === 'dark' ? 'light' : 'dark';
    const currentSystem: 'light' | 'dark' = systemDark ? 'dark' : 'light';

    if (target === currentSystem) {
      try {
        localStorage.removeItem('color-scheme');
      } catch {
        // ignore storage errors
      }
      setOverride(null);
    } else {
      try {
        localStorage.setItem('color-scheme', target);
      } catch {
        // ignore storage errors
      }
      setOverride(target);
    }
  }, [override, systemDark]);

  return {
    resolvedTheme,
    isOverridden: override !== null,
    toggleTheme,
  };
}
