'use server';

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db/db';

const bcrypt = require('bcrypt');

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
}

// THANKS TO https://github.com/balazsorban44/auth-poc-next/blob/main/lib.ts

const secretKey = process.env.JWT_SECRET;
const key = new TextEncoder().encode(secretKey);

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

async function invalidateUserTokens(userId: string) {
  // Delete all refresh tokens for the user
  await db('DELETE FROM "RefreshToken" WHERE "userId" = $1', [userId]);
}

async function updateUserRole(userId: string, newRole: string) {
  // Update the user's role in the database
  await db('UPDATE "User" SET role = $1 WHERE id = $2', [newRole, userId]);

  // Invalidate all tokens for the user
  await invalidateUserTokens(userId);
}

// In your admin panel or wherever you change user roles:
export async function changeUserRole(req: NextRequest) {
  const { userId, newRole } = await req.json();

  await updateUserRole(userId, newRole);

  return NextResponse.json({
    message: 'User role updated and tokens invalidated',
  });
}

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24 hours from now')
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}

// https://stackoverflow.com/a/17201754
async function hash_password(input: string): Promise<any> {
  var salt = bcrypt.genSaltSync(10);
  var hash = bcrypt.hashSync(input, salt);

  // Store hash in your password DB.
  return hash;
}

async function check_password(input: string, hash: string): Promise<any> {
  // Load hash from your password DB.
  return bcrypt.compareSync(input, hash); // true
}

export async function register(prevState: any, formData: FormData) {
  // VALIDATE THE DATA CAME IN CORRECTLY IN FORMATS
  if (formData.get('username') == '') {
    return { message: 'Please provide a username.' };
  }

  if (formData.get('email') == '') {
    return { message: 'Please provide an email address.' };
  }

  if (
    formData.get('password') == '' ||
    (formData.get('password') as string).length < 8
  ) {
    return { message: 'Please provide a password of more than 8 characters.' };
  }

  if (formData.get('access_code') == '') {
    return { message: 'Please provide an access code.' };
  }

  if (formData.get('access_code') != process.env.ACCESS_CODE) {
    return { message: "We're sorry, that access code is not valid." };
  }

  // verify email aren't taken
  const query = 'SELECT * FROM "User" WHERE email = $1';
  const params = [formData.get('email')];
  const usersWithEmail = await db(query, params);

  if (usersWithEmail.length > 0) {
    return {
      message:
        "We're sorry, there is already an account registered to that email address.",
    };
  }

  // verify usenrame aren't taken
  const query2 = 'SELECT * FROM "User" WHERE username = $1';
  const params2 = [formData.get('username')];
  const usersWithUsername = await db(query2, params2);

  if (usersWithUsername.length > 0) {
    return {
      message:
        "We're sorry, there is already an account registered to that username.",
    };
  }

  // store user in DB
  const query3 =
    'INSERT INTO "User" ("username", "email", "passwordHash") VALUES ($1, $2, $3)';
  const params3 = [
    formData.get('username'),
    formData.get('email'),
    await hash_password(formData.get('password')?.toString() || ''),
  ];
  const userCreated = await db(query3, params3); // this returns nothing []

  // get user info from database by email/password
  const query4 = `SELECT * FROM "User" WHERE username = $1`;
  const params4 = [formData.get('username')];
  const usersFromCreated = await db(query4, params4);

  if (usersFromCreated.length != 1) {
    return {
      message:
        "We're sorry, there was an error trying to locate the user that was created. Error number #5543",
    };
  }

  const user = usersFromCreated[0];
  delete user['passwordHash'];

  // Create default memecache for the user
  const query5 = `INSERT INTO "Cache" ("name", "ownerUserId") VALUES ($1, $2)`;
  const params5 = [formData.get('username') + "'s Memes", user.id];
  const cacheCreated = await db(query5, params5);

  const { accessToken, refreshToken } = await createTokens(user as any);

  // Save the session in a cookie
  cookies().set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60, // 15 minutes
  });

  cookies().set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  redirect('/');
}

export async function login(prevState: any, formData: FormData) {
  // Verify credentials && get the user
  if (formData.get('email') == '') {
    return { message: 'Please provide an email address.' };
  }

  if (
    formData.get('password') == '' ||
    (formData.get('password') as string).length < 8
  ) {
    return { message: 'Please provide a password of more than 8 characters.' };
  }

  // validate credentials
  const query =
    'SELECT id, email, username, role, "passwordHash" FROM "User" WHERE email = $1';
  const params = [formData.get('email')];
  const users = await db(query, params);

  if (users.length == 0) {
    return { message: 'No account was found with that information.' };
  }

  if (users.length > 1) {
    return {
      message:
        "We're sorry, somehow we located multiple users with that login information. What the heck? Error number #4674",
    };
  }

  const user = users[0]; // get user info from database by email/password

  let password_valid = await check_password(
    formData.get('password')?.toString() || '',
    user.passwordHash
  );
  if (!password_valid) {
    return { message: 'No account was found with that information.' };
  }

  delete user['passwordHash']; // strip the password off the object

  const { accessToken, refreshToken } = await createTokens(user as any);

  // Save the session in a cookie
  cookies().set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60, // 15 minutes
  });

  cookies().set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  redirect('/');
}

export async function logout() {
  const refreshToken = cookies().get('refreshToken')?.value;
  if (refreshToken) {
    // Remove refresh token from database
    await db('DELETE FROM "RefreshToken" WHERE token = $1', [refreshToken]);
  }

  // Destroy the session
  cookies().set('accessToken', '', { maxAge: 0 });
  cookies().set('refreshToken', '', { maxAge: 0 });

  redirect('/login');
}

export async function handleTokenRefresh(request: NextRequest) {
  const refreshToken = request.cookies.get('refreshToken')?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { error: 'No refresh token provided' },
      { status: 401 }
    );
  }

  try {
    const { accessToken, user } = await refreshAccessToken(refreshToken);

    const response = NextResponse.json({ success: true, user });
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60, // 15 minutes
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401 }
    );
  }
}

export async function getUserFromAccessToken() {
  const accessToken = cookies().get('accessToken')?.value;

  const user = await validateAccessToken(accessToken!);
  if (user) {
    // Token is valid, attach user to the request
    return user;
  }
  return undefined;
}

// export async function getSession() {
//   const session = cookies().get('accessToken')?.value;
//   if (!session) return null;
//   return await decrypt(session);
// }

// export async function updateSession(request: NextRequest) {
//   const session = request.cookies.get('session')?.value;
//   if (!session) return;

//   // Refresh the session so it doesn't expire
//   const parsed = await decrypt(session);
//   parsed.expires = new Date(Date.now() + 2400 * 1000);
//   const res = NextResponse.next();
//   res.cookies.set({
//     name: 'session',
//     value: await encrypt(parsed),
//     httpOnly: true,
//     expires: parsed.expires,
//     secure: process.env.NODE_ENV === 'production',
//     sameSite: 'strict',
//   });
//   return res;
// }
