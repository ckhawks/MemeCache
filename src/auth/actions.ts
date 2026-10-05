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
  getUserForLogin,
  isEmailTaken,
  isUsernameTaken,
} from '@/db/queries/users';
import {
  checkInviteCode,
  createInvitedUser,
  type InviteCheck,
} from '@/db/queries/invites';

// What registration says about an access code that cannot be used. Null: it can.
const INVITE_MESSAGES: Record<InviteCheck, string | null> = {
  active: null,
  unknown: "We're sorry, that access code is not valid.",
  disabled: "We're sorry, that access code has been turned off.",
  expired: "We're sorry, that access code has expired.",
  'used-up': "We're sorry, that access code has been used as many times as it allows.",
};

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
  const accessCode = formData.get('access_code')?.toString().trim() ?? '';

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

  // Invite codes come from /admin/invites (migration 009). ACCESS_CODE in the environment
  // is the old shared code: it still works, but only until the first invite code exists,
  // so production keeps taking signups until an admin makes one. After that it can be
  // removed from .env.
  const fallbackCode = process.env.ACCESS_CODE;
  const codeMessage = INVITE_MESSAGES[await checkInviteCode(accessCode, fallbackCode)];
  if (codeMessage) {
    return { message: codeMessage };
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

  const user = await createInvitedUser(
    {
      username,
      email,
      passwordHash: await hashPassword(password),
    },
    accessCode,
    fallbackCode
  );
  if (!user) {
    // Usable a moment ago: someone else took its last use, or it was disabled, in between.
    const nowMessage = INVITE_MESSAGES[await checkInviteCode(accessCode, fallbackCode)];
    return { message: nowMessage ?? INVITE_MESSAGES['used-up'] };
  }

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
