// @/auth/lib.ts
//
// Server-only auth helpers. This file deliberately does NOT carry 'use server' -- that
// directive turns every export into a publicly callable server action, which previously
// exposed validateAccessToken, refreshAccessToken and updateUserActivity(userId) as
// unauthenticated endpoints. The three real form actions live in @/auth/actions instead.

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '@/db/db';

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
}

// THANKS TO https://github.com/balazsorban44/auth-poc-next/blob/main/lib.ts

const accessTokenSecret = process.env.JWT_ACCESS_SECRET!;
const refreshTokenSecret = process.env.JWT_REFRESH_SECRET!;

const accessTokenKey = new TextEncoder().encode(accessTokenSecret);
const refreshTokenKey = new TextEncoder().encode(refreshTokenSecret);

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
// So the access token now simply lives as long as the refresh token and there is nothing
// to refresh. The cost is that a stolen token stays valid until it expires; revocation is
// logout (which deletes the refresh token row) and the role check in validateAccessToken.
// Acceptable for an invite-only site. If registration ever opens, see db/MIGRATION.md.
export const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

async function createAccessToken(user: UserPayload) {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessTokenKey);
}

async function createRefreshToken(userId: string) {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // Longer-lived refresh token
    .sign(refreshTokenKey);
}

export async function createTokens(user: UserPayload) {
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  // Store refresh token in database
  await db('INSERT INTO "RefreshToken" ("userId", token) VALUES ($1, $2)', [
    user.id,
    refreshToken,
  ]);

  return { accessToken, refreshToken };
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
    const [user] = await db(
      'SELECT role, "lastActive" FROM "User" WHERE id = $1',
      [payload.id]
    );

    if (!user || user.role !== payload.role) {
      return null; // Token is no longer valid
    }

    // This used to write on every single request. Only write when the value is actually
    // stale -- getOnlineUsers() buckets to 15 minutes, so 5-minute resolution is ample.
    const last = user.lastActive ? new Date(user.lastActive).getTime() : 0;
    if (Date.now() - last > ACTIVITY_WRITE_INTERVAL_MS) {
      await updateUserActivity(payload?.id as string);
    }

    return payload as unknown as UserPayload;
  } catch (error) {
    return null;
  }
}

// The refresh token is still issued and still recorded in the RefreshToken table, because
// logout deletes the row and that is what a future "log out everywhere" would hang off.
// Nothing redeems it for a new access token any more -- the access token outlives it being
// needed. refreshAccessToken() and handleTokenRefresh() were removed along with middleware.

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

export async function getUserFromAccessToken() {
  const accessToken = cookies().get('accessToken')?.value;
  if (!accessToken) {
    return undefined;
  }

  const user = await validateAccessToken(accessToken);
  if (user) {
    // Token is valid, attach user to the request
    return user;
  }
  return undefined;
}

export async function updateUserActivity(userId: string) {
  const query = `UPDATE "User" SET "lastActive" = NOW() WHERE id = $1`;
  await db(query, [userId]);
}
