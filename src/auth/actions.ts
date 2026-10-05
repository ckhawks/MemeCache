// @/auth/actions.ts
//
// The only three auth functions that are meant to be callable from the client. Everything
// under 'use server' becomes a public endpoint, so nothing else belongs in this file --
// the helpers live in @/auth/lib.

'use server';

import { redirect } from 'next/navigation';
import { safeNext } from '@/util/safeNext';
import { cookies } from 'next/headers';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  checkPassword,
  createAccessToken,
  hashPassword,
} from '@/auth/lib';
import {
  createUser,
  getUserForLogin,
  isEmailTaken,
  isUsernameTaken,
} from '@/db/queries/users';

// Must match the JWT's own expiry. When these disagreed -- a 15 minute cookie holding a
// token that middleware was supposed to refresh -- the browser dropped a still-valid
// session and the user appeared logged out.
const ACCESS_TOKEN_MAX_AGE = ACCESS_TOKEN_TTL_SECONDS;

async function setSessionCookie(accessToken: string) {
  (await cookies()).set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
}

export async function register(prevState: any, formData: FormData) {
  const username = formData.get('username')?.toString() ?? '';
  const email = formData.get('email')?.toString() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  const accessCode = formData.get('access_code')?.toString() ?? '';

  if (username === '') {
    return { message: 'Please provide a username.' };
  }

  if (email === '') {
    return { message: 'Please provide an email address.' };
  }

  if (password.length < 8) {
    return { message: 'Please provide a password of more than 8 characters.' };
  }

  if (accessCode === '') {
    return { message: 'Please provide an access code.' };
  }

  if (accessCode !== process.env.ACCESS_CODE) {
    return { message: "We're sorry, that access code is not valid." };
  }

  if (await isEmailTaken(email)) {
    return {
      message:
        "We're sorry, there is already an account registered to that email address.",
    };
  }

  if (await isUsernameTaken(username)) {
    return {
      message:
        "We're sorry, there is already an account registered to that username.",
    };
  }

  const user = await createUser({
    username,
    email,
    passwordHash: await hashPassword(password),
  });

  await setSessionCookie(await createAccessToken(user));

  redirect('/');
}

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email')?.toString() ?? '';
  const password = formData.get('password')?.toString() ?? '';

  if (email === '') {
    return { message: 'Please provide an email address.' };
  }

  if (password.length < 8) {
    return { message: 'Please provide a password of more than 8 characters.' };
  }

  const user = await getUserForLogin(email);
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    return { message: 'No account was found with that information.' };
  }

  await setSessionCookie(await createAccessToken(user));

  redirect(safeNext(formData.get('next')));
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set('accessToken', '', { maxAge: 0 });
  // Sessions before migration 002 also carried a refresh token cookie. Clear it too.
  cookieStore.set('refreshToken', '', { maxAge: 0 });

  redirect('/login');
}
