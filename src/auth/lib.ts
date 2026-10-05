// @/auth/lib.ts
//
// Server-only auth helpers. This file deliberately does NOT carry 'use server' -- that
// directive turns every export into a publicly callable server action, which previously
// exposed validateAccessToken, refreshAccessToken and updateUserActivity(userId) as
// unauthenticated endpoints. The three real form actions live in @/auth/actions instead.

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getSessionState, touchLastActive } from '@/db/queries/users';

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
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
// went away with migration 002. The cost is that a stolen token stays valid until it
// expires; the only server-side revocation is the role check in validateAccessToken.
// Acceptable for an invite-only site. If registration ever opens, see db/MIGRATION.md.
export const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createAccessToken(user: UserPayload) {
  // Only these four fields. Spreading a database row in here would put whatever else the
  // row carries into a token the browser holds.
  return await new SignJWT({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessTokenKey);
}

// The session cookie lives exactly as long as the token inside it. @/auth/actions has its
// own copy for login and registration; this one is for route handlers (renaming).
export async function setSessionCookie(accessToken: string) {
  (await cookies()).set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
}

// How stale "lastActive" is allowed to get before it is worth a write.
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export async function validateAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, accessTokenKey, {
      algorithms: ['HS256'],
    });

    // Check the user still exists and their role has not changed. With no short-lived
    // token to expire, this role check is the main way a session stops being valid
    // before logout, so it stays on the request path.
    const user = await getSessionState(payload.id as string);

    if (!user || user.role !== payload.role) {
      return null; // Token is no longer valid
    }

    // This used to write on every single request. Only write when the value is actually
    // stale -- getOnlineUsers() buckets to 15 minutes, so 5-minute resolution is ample.
    const last = user.lastActive ? new Date(user.lastActive).getTime() : 0;
    if (Date.now() - last > ACTIVITY_WRITE_INTERVAL_MS) {
      await touchLastActive(payload.id as string);
    }

    // The name in the token is the one they had when it was issued. Renaming re-issues the
    // cookie, but an admin rename or another device would still carry the old one.
    return { ...(payload as unknown as UserPayload), username: user.username };
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
