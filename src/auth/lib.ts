// @/auth/lib.ts
//
// Server-only auth helpers. This file deliberately does NOT carry 'use server' -- that
// directive turns every export into a publicly callable server action, which previously
// exposed validateAccessToken, refreshAccessToken and updateUserActivity(userId) as
// unauthenticated endpoints. The three real form actions live in @/auth/actions instead.

import { NextRequest } from 'next/server';
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

async function createAccessToken(user: UserPayload) {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m') // Short-lived access token
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

export async function validateAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, accessTokenKey, {
      algorithms: ['HS256'],
    });

    // Check if the user still exists and their role hasn't changed
    const [user] = await db('SELECT role FROM "User" WHERE id = $1', [
      payload.id,
    ]);

    if (!user || user.role !== payload.role) {
      return null; // Token is no longer valid
    }

    // Update user's last activity
    await updateUserActivity(payload?.id as string);

    return payload as unknown as UserPayload;
  } catch (error) {
    return null;
  }
}

export async function validateRefreshToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, refreshTokenKey, {
      algorithms: ['HS256'],
    });
    return payload as { userId: string };
  } catch (error) {
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string) {
  const payload = await validateRefreshToken(refreshToken);
  if (!payload) {
    throw new Error('Invalid refresh token');
  }

  // Check if refresh token exists in database
  const [dbToken] = await db('SELECT * FROM "RefreshToken" WHERE token = $1', [
    refreshToken,
  ]);
  if (!dbToken) {
    throw new Error('Refresh token not found');
  }

  // Get user data
  const [user] = await db(
    'SELECT id, username, email, role FROM "User" WHERE id = $1',
    [payload.userId]
  );
  if (!user) {
    throw new Error('User not found');
  }

  // Create new access token
  const accessToken = await createAccessToken(user as any);

  return { accessToken, user };
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

export async function handleTokenRefresh(
  request: NextRequest
): Promise<{ accessToken: string; user: UserPayload } | null> {
  const refreshToken = request.cookies.get('refreshToken')?.value;
  if (!refreshToken) {
    console.log('No refresh token provided');
    return null;
  }

  try {
    const { accessToken, user } = await refreshAccessToken(refreshToken);
    // @ts-ignore
    return { accessToken, user };
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
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
