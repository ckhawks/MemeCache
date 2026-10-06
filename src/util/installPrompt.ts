// The browser's offer to install the site as an app (Chrome and Edge, on Android and
// desktop). It fires once, early, often before the user menu has mounted, so
// ServiceWorkerRegister catches it at startup and keeps it here until someone asks.
// Safari never fires it: iOS installs only through Share > Add to Home Screen.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach((listener) => listener());
}

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Stops Chrome's own mini bar; the user menu offers it instead.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canPromptInstall() {
  return deferred !== null;
}

// Shows the browser's install dialog. It can only be used once, either way.
export async function promptInstall() {
  const event = deferred;
  if (!event) {
    return;
  }
  deferred = null;
  changed();
  await event.prompt();
}

// Already running as the installed app.
export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPhone and iPad Safari, which can install but only by hand. iPadOS reports itself as a Mac,
// so a Mac with a touch screen counts too.
export function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
