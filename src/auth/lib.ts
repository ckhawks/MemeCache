'use server';

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/db/db';

const bcrypt = require('bcrypt');

// const query = 'SELECT * FROM "Tracker" WHERE userid = $1';
//   const params = [userId];
//   const { rows: trackers } = await sql.query(query, params);

// THANKS TO https://github.com/balazsorban44/auth-poc-next/blob/main/lib.ts

const secretKey = process.env.JWT_SECRET; // change to use env variable
const key = new TextEncoder().encode(secretKey);

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
  delete user['password'];

  // Create the session
  const expires = new Date(Date.now() + 2400 * 1000);
  const session = await encrypt({ user, expires });

  // Save the session in a cookie
  cookies().set('session', session, { expires, httpOnly: true });
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
    'SELECT id, email, username, "passwordHash" FROM "User" WHERE email = $1';
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

  // Create the session
  const expires = new Date(Date.now() + 2400 * 1000);
  const session = await encrypt({ user, expires });

  // Save the session in a cookie
  cookies().set('session', session, { expires, httpOnly: true });
  redirect('/');
}

export async function logout() {
  // Destroy the session
  cookies().set('session', '', { expires: new Date(0) });
  redirect('/login');
}

export async function getSession() {
  const session = cookies().get('session')?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return;

  // Refresh the session so it doesn't expire
  const parsed = await decrypt(session);
  parsed.expires = new Date(Date.now() + 2400 * 1000);
  const res = NextResponse.next();
  res.cookies.set({
    name: 'session',
    value: await encrypt(parsed),
    httpOnly: true,
    expires: parsed.expires,
  });
  return res;
}
