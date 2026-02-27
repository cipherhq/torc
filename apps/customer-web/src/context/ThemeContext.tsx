import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('torc-theme');
    return (stored === 'dark' ? 'dark' : 'light') as Theme;
  });

  useEffect(() => {
    const root = document.documentElement;
    const parsePx = (value: string) => {
      const parsed = Number.parseFloat(value || '0');
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const updateViewportMetrics = () => {
      const viewport = window.visualViewport;
      const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
      const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
      const isMobileLike =
        (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
        (window.matchMedia?.('(max-width: 1024px)').matches ?? false);

      root.style.setProperty('--app-width', `${width}px`);
      root.style.setProperty('--app-height', `${height}px`);

      const computed = getComputedStyle(root);
      const safeTopEnv = parsePx(computed.getPropertyValue('--safe-top-env'));
      const safeBottomEnv = parsePx(computed.getPropertyValue('--safe-bottom-env'));
      const baseInset = isMobileLike ? 12 : 0;
      const safeTop = Math.max(safeTopEnv, viewport?.offsetTop ?? 0, baseInset);
      const safeBottom = Math.max(safeBottomEnv, baseInset);

      root.style.setProperty('--safe-top', `${Math.round(safeTop)}px`);
      root.style.setProperty('--safe-bottom', `${Math.round(safeBottom)}px`);

    };

    updateViewportMetrics();

    const viewport = window.visualViewport;
    window.addEventListener('resize', updateViewportMetrics);
    window.addEventListener('orientationchange', updateViewportMetrics);
    viewport?.addEventListener('resize', updateViewportMetrics);
    viewport?.addEventListener('scroll', updateViewportMetrics);

    return () => {
      window.removeEventListener('resize', updateViewportMetrics);
      window.removeEventListener('orientationchange', updateViewportMetrics);
      viewport?.removeEventListener('resize', updateViewportMetrics);
      viewport?.removeEventListener('scroll', updateViewportMetrics);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('torc-theme', theme);

  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
