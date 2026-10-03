import { NextResponse } from 'next/server';

// The service worker (public/sw.js) normally answers this POST before it reaches the
// server. If it is not installed yet, send the user to the upload page rather than a 404.
export function POST(request: Request) {
  return NextResponse.redirect(new URL('/upload', request.url), 303);
}
