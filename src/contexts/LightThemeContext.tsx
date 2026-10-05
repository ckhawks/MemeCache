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

// The browser's own copy: localStorage for this provider, the cookie for the server's first
// render (getInitialLightTheme).
function rememberTheme(theme: string) {
  localStorage.setItem('theme', theme);
  document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export const LightThemeProvider = ({
  children,
  initialTheme,
  accountTheme,
  loggedIn,
}: {
  children: React.ReactNode;
  initialTheme: string;
  // The theme saved on the logged-in member's account (user_setting, migration 018), which
  // wins over this browser's. Null for visitors and for members who never chose one.
  accountTheme: string | null;
  loggedIn: boolean;
}) => {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    // Syncing from the account, localStorage and the OS preference on mount is the
    // external-system case effects exist for. docs/ui-and-pwa.md phase B replaces this with
    // a prefers-color-scheme default in CSS.
    if (accountTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(accountTheme);
      applyTheme(accountTheme);
      // So the next visit on this device starts right even before logging in.
      rememberTheme(accountTheme);
      return;
    }
    // Check for saved user preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
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
  }, [accountTheme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    applyTheme(newTheme);
    rememberTheme(newTheme);
    // Logged in: save it on the account too, so other devices follow. A failure only means
    // they do not; this device already switched.
    if (loggedIn) {
      fetch('/api/user/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme }),
      }).catch(() => undefined);
    }
  };

  return (
    <LightThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </LightThemeContext.Provider>
  );
};
