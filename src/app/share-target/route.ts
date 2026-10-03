// The service worker (public/sw.js) normally answers this POST before it reaches the
// server. If it is not installed yet, send the user to the upload page rather than a 404.
// A relative Location on purpose: behind nginx, request.url is the internal
// localhost:3007 address, which is where an absolute redirect would send the browser.
export function POST() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/upload',
    },
  });
}
