'use client';

import { useEffect } from 'react';

// Registers public/sw.js. Production only: in development a worker outlives code changes
// and makes hot reload confusing. Test it with `npm run build && npm run start`.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  }, []);

  return null;
}
