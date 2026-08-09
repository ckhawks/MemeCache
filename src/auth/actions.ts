// @/auth/actions.ts
//
// The only three auth functions that are meant to be callable from the client. Everything
// under 'use server' becomes a public endpoint, so nothing else belongs in this file --
// the helpers live in @/auth/lib.

'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db/db';
import { checkPassword, createTokens, hashPassword } from '@/auth/lib';

const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function setSessionCookies(accessToken: string, refreshToken: string) {
  cookies().set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  cookies().set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
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
  const query2 = 'SELECT * FROM "User" WHERE LOWER(username) = LOWER($1)';
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
    'INSERT INTO "User" ("username", "email", "passwordHash", "role") VALUES ($1, $2, $3, $4)';
  const params3 = [
    formData.get('username'),
    formData.get('email'),
    await hashPassword(formData.get('password')?.toString() || ''),
    'user',
  ];
  await db(query3, params3); // this returns nothing []

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
  await db(query5, params5);

  const { accessToken, refreshToken } = await createTokens(user as any);

  // Save the session in a cookie
  setSessionCookies(accessToken, refreshToken);

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

  const password_valid = await checkPassword(
    formData.get('password')?.toString() || '',
    user.passwordHash
  );
  if (!password_valid) {
    return { message: 'No account was found with that information.' };
  }

  delete user['passwordHash']; // strip the password off the object

  const { accessToken, refreshToken } = await createTokens(user as any);

  // Save the session in a cookie
  setSessionCookies(accessToken, refreshToken);

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
