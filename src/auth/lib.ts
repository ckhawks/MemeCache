// @/auth/lib.ts
//
// Server-only auth helpers. This file deliberately does NOT carry 'use server' -- that
// directive turns every export into a publicly callable server action, which previously
// exposed validateAccessToken, refreshAccessToken and updateUserActivity(userId) as
// unauthenticated endpoints. The three real form actions live in @/auth/actions instead.

import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import {
  checkSession,
  createSession,
  revokeSession,
  SESSION_TTL_SECONDS,
  touchSession,
} from '@/db/queries/sessions';

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
  // The user_session row this token belongs to (migration 018).
  sessionId: string;
}

// THANKS TO https://github.com/balazsorban44/auth-poc-next/blob/main/lib.ts

const accessTokenSecret = process.env.JWT_ACCESS_SECRET!;

const accessTokenKey = new TextEncoder().encode(accessTokenSecret);

// The access token used to last 15 minutes, with middleware silently minting a new one
// from the refresh token on every request. That could not survive the move to self-hosted
// Postgres: middleware runs in the Edge Runtime, which cannot open a database connection,
// and the Neon HTTP driver was the only thing that ever made it work.
//
// It was also only half working. Middleware set the refreshed cookie on the *response*,
// while the server component rendering the page read the *request* -- so the refresh never
// helped the render that triggered it. That is the "random sign outs" and "no session on
// first SSR load" pair in TODO.md.
//
// So the access token is the whole session, valid for a week, and there is nothing to
// refresh. The refresh token that used to be issued alongside it was never redeemed, and
// went away with migration 002.
//
// Since migration 018 the token names a user_session row (`sid`), and validateAccessToken
// rejects it once that row is revoked: logging out, "log out everywhere else", or deleting
// the account ends it on the server, not just in the browser that held it.
export const ACCESS_TOKEN_TTL_SECONDS = SESSION_TTL_SECONDS;

export async function createAccessToken(user: UserPayload) {
  // Only these fields. Spreading a database row in here would put whatever else the row
  // carries into a token the browser holds.
  return await new SignJWT({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    sid: user.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessTokenKey);
}

// The session cookie lives exactly as long as the token inside it. When these disagreed --
// a 15 minute cookie holding a token that middleware was supposed to refresh -- the browser
// dropped a still-valid session and the user appeared logged out.
export async function setSessionCookie(accessToken: string) {
  (await cookies()).set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set('accessToken', '', { maxAge: 0 });
  // Sessions before migration 002 also carried a refresh token cookie. Clear it too.
  cookieStore.set('refreshToken', '', { maxAge: 0 });
}

// The request's address, as the reverse proxy reported it. Only ever stored coarsened
// (coarseNetwork) and only shown back to the user, so a spoofed header fools nobody but the
// person sending it.
function requestIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headerList.get('x-real-ip');
}

// Logs a user in on this browser: a new session row, a token naming it, and the cookie.
// For server actions and route handlers, where cookies can be set.
export async function startSession(user: Omit<UserPayload, 'sessionId'>) {
  const headerList = await headers();
  const sessionId = await createSession({
    userId: user.id,
    userAgent: headerList.get('user-agent'),
    ip: requestIp(headerList),
  });
  await setSessionCookie(await createAccessToken({ ...user, sessionId }));
  return sessionId;
}

// Logout: revokes this browser's session on the server, then drops the cookie. The token
// is checked only for its signature here, so an already revoked one still clears the
// cookie.
export async function endCurrentSession() {
  const token = (await cookies()).get('accessToken')?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, accessTokenKey, {
        algorithms: ['HS256'],
      });
      if (typeof payload.id === 'string' && typeof payload.sid === 'string') {
        await revokeSession(payload.id, payload.sid);
      }
    } catch {
      // A forged or expired token has no session worth revoking.
    }
  }
  await clearSessionCookie();
}

export async function validateAccessToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, accessTokenKey, {
      algorithms: ['HS256'],
    });

    // Tokens from before migration 018 carry no session id. They are rejected, which logs
    // everyone out once when it ships; letting them run to expiry would leave up to a week
    // of sessions that "log out everywhere" could not reach.
    if (typeof payload.id !== 'string' || typeof payload.sid !== 'string') {
      return null;
    }

    // The session is still open, the user still exists and is not deleted, and their role
    // has not changed since the token was issued. One query, on every request.
    const session = await checkSession(payload.id, payload.sid);
    if (!session || session.role !== payload.role) {
      return null; // Token is no longer valid
    }

    // last_seen_at for the device list and last_active for "who's online", each written
    // only when stale. getOnlineUsers() buckets to 15 minutes, so 5 minutes is ample.
    await touchSession(payload.id, payload.sid, session);

    // The name in the token is the one they had when it was issued. Renaming re-issues the
    // cookie, but an admin rename or another device would still carry the old one.
    return {
      id: payload.id,
      username: session.username,
      email: payload.email as string,
      role: session.role,
      sessionId: payload.sid,
    };
  } catch (error) {
    return null;
  }
}

// https://stackoverflow.com/a/17201754
export async function hashPassword(input: string): Promise<string> {
  const bcrypt = require('bcrypt');
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(input, salt);
}

export async function checkPassword(
  input: string,
  hash: string
): Promise<boolean> {
  const bcrypt = require('bcrypt');
  return bcrypt.compareSync(input, hash);
}

// cache(): once per request. The page and the navigation bar both ask for the session user,
// and without it each would verify the token and query the database separately.
export const getUserFromAccessToken = cache(async (): Promise<UserPayload | undefined> => {
  const accessToken = (await cookies()).get('accessToken')?.value;
  if (!accessToken) {
    return undefined;
  }
  return (await validateAccessToken(accessToken)) ?? undefined;
});
