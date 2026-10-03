'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextProps {
  theme: string;
  toggleTheme: () => void;
}

const LightThemeContext = createContext<ThemeContextProps>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(LightThemeContext);

// Our styles read data-theme; Bootstrap's components read data-bs-theme.
function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
}

export const LightThemeProvider = ({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: string;
}) => {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    // Check for saved user preference
    const savedTheme = localStorage.getItem('theme');
    // Syncing from localStorage and the OS preference on mount is the external-system
    // case effects exist for; the server cannot know either. docs/ui-and-pwa.md phase B
    // replaces this with a prefers-color-scheme default in CSS.
    if (savedTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Detect system theme preference
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      setTheme(systemTheme);
      applyTheme(systemTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <LightThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </LightThemeContext.Provider>
  );
};
