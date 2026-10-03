// MemeCache service worker. Deliberately small: it does two things.
//
// 1. Share target. Android posts a shared file to /share-target (see src/app/manifest.ts).
//    The session cookie is SameSite=Strict, and that post is a navigation the OS starts,
//    so it would reach the server logged out. Instead the worker keeps the file in Cache
//    Storage and opens /upload?shared=1, where the logged-in page picks it up.
// 2. An offline page for navigations when the network is down.
//
// It does not cache memes or pages. A cached feed is a stale feed.

const SHARE_CACHE = 'share-target';
const SHARED_FILE_URL = '/shared-file';
const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function receiveShare(request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (file instanceof File) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARED_FILE_URL,
      new Response(file, {
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name),
        },
      })
    );
  }

  return Response.redirect('/upload?shared=1', 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
