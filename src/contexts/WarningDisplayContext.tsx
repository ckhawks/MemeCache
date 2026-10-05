'use client';

import { createContext, useContext } from 'react';
import type { WarningDisplay } from '@/constants/contentWarnings';

// How the viewer wants memes with content warnings shown, read from their account by the
// root layout so every WarningCover on the page agrees without fetching it. Visitors, and
// anything rendered outside the provider, get 'blur'.
const WarningDisplayContext = createContext<WarningDisplay>('blur');

export const useWarningDisplay = () => useContext(WarningDisplayContext);

export function WarningDisplayProvider(props: {
  display: WarningDisplay;
  children: React.ReactNode;
}) {
  return (
    <WarningDisplayContext.Provider value={props.display}>
      {props.children}
    </WarningDisplayContext.Provider>
  );
}
