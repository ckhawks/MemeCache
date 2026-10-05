import type { ClientEventKind } from '@/constants/events';

// Tells the server something happened in the browser (POST /api/event), for the event table.
// Fire and forget, like the view beacon: keepalive lets it finish when the click also leaves
// the page, and a failure is nobody's concern.
export function track(
  kind: ClientEventKind,
  fields: { memeId?: string; query?: string; position?: number } = {}
) {
  fetch('/api/event', {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kind, ...fields }),
  }).catch(() => undefined);
}
