'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from '@/util/installPrompt';

// Registers public/sw.js, and catches the browser's install offer for the user menu. Production only: in development a worker outlives code changes
// and makes hot reload confusing. Test it with `npm run build && npm run start`.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  }, []);

  return null;
}
