import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 60000);
  return () => clearInterval(timer);
}

// The current minute, for relative times that should tick over while a page stays open.
// Null on the server and during hydration, where the caller falls back to Date.now(); React
// renders again with the browser's own minute straight after.
export function useMinute(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 60000),
    () => null
  );
}
