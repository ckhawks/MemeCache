'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_MS = 30_000;

// Running as the installed app rather than in a browser tab. The same check as
// src/util/installPrompt.ts.
function installed() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ping(path: string, view: boolean, referrer?: string) {
  fetch('/api/presence', {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, view, referrer, installed: installed() }),
  }).catch(() => undefined);
}

// Reports each page opened, and checks in every 30 seconds while the tab is in front, for
// /admin/live (POST /api/presence). Only the path goes, never the query string, so search
// text stays out of it. Renders nothing.
export default function PresenceBeacon() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // The referrer only means something on the page the visit landed on.
    ping(pathname, true, first.current && document.referrer ? document.referrer : undefined);
    first.current = false;
  }, [pathname]);

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') {
        ping(window.location.pathname, false);
      }
    };
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);

  return null;
}
