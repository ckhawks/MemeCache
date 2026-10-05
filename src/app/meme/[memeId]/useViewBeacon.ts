'use client';

import { useCallback, useEffect, useRef } from 'react';

// How long the page has to be on screen before the view counts.
const VIEW_DELAY_MS = 1000;

// Counts a view of the meme (POST /api/meme/[id]/view), once per page visit: after the page
// has been visible for a second, or straight away when the returned function is called (a
// video starting). Running in the browser is the point. Link previews, prefetches and most
// bots fetch the page without running it, so they never get here.
//
// A tab opened in the background waits until it is shown. The server decides whether the
// view counts (once per viewer per day, never the uploader), so a stray second call is
// harmless.
export function useViewBeacon(memeId: string): () => void {
  const sent = useRef<string | null>(null);

  const send = useCallback(() => {
    if (sent.current === memeId) {
      return;
    }
    sent.current = memeId;
    // keepalive lets it finish if the viewer leaves right at the second.
    fetch(`/api/meme/${memeId}/view`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [memeId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        timer = setTimeout(send, VIEW_DELAY_MS);
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [send]);

  return send;
}
