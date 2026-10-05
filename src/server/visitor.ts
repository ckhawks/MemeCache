import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { isUuid } from '@/db/queries/ids';

// The logged-out visitor's id (migration 015): random, nothing else in it, kept in an
// httpOnly cookie. View counts and events tell visitors apart by it.
const VISITOR_COOKIE = 'visitor';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

// The visitor's id, setting the cookie first if they have none. Route handlers only: a page
// cannot set cookies while rendering.
export async function visitorKey(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE)?.value;
  if (isUuid(existing)) {
    return existing;
  }
  const key = randomUUID();
  cookieStore.set(VISITOR_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return key;
}

// The visitor's id if they have one already, for pages, which cannot set it.
export async function existingVisitorKey(): Promise<string | null> {
  const key = (await cookies()).get(VISITOR_COOKIE)?.value;
  return isUuid(key) ? key : null;
}
