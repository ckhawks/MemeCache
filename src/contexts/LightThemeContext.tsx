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
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Detect system theme preference
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      setTheme(systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <LightThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </LightThemeContext.Provider>
  );
};
