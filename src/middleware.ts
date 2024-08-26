// middleware.ts

import { handleTokenRefresh, validateAccessToken } from '@/auth/lib';
import { NextRequest, NextResponse } from 'next/server';

export async function middlewareOld(request: NextRequest) {
  // console.log('middleware');
  const accessToken = request.cookies.get('accessToken')?.value;

  if (!accessToken) {
    // No access token provided
    // return NextResponse.next();
  }

  const user = await validateAccessToken(accessToken || '');
  if (user) {
    // Token is valid, attach user to the request
    (request as any).user = user;
    return NextResponse.next();
  }

  // Token is invalid, try to refresh
  console.log('Token is invalid, try to refresh');
  await handleTokenRefresh(request);
  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;

  // If there's no refresh token, do nothing
  if (!refreshToken) {
    // return NextResponse.redirect(new URL('/login', request.url));
    // Token refresh failed, redirect to login
    const response = NextResponse.next();

    // Set a flag to indicate that middleware has run
    response.cookies.set('middleware_run', 'true', {
      httpOnly: false,
      maxAge: 60 * 60, // 1 hour
    });

    return response;
  }

  // If there's no access token or it's invalid, try to refresh
  if (!accessToken || !(await validateAccessToken(accessToken))) {
    console.log('Access token is invalid or missing, attempting to refresh');
    const refreshResult = await handleTokenRefresh(request);

    if (refreshResult) {
      // Token refresh successful
      const { accessToken, user } = refreshResult;
      const response = NextResponse.next();
      response.cookies.set('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60, // 15 minutes
      });
      response.headers.set('X-User-ID', user.id);
      // Set a flag to indicate that middleware has run
      response.cookies.set('middleware_run', 'true', {
        httpOnly: false,
        maxAge: 60 * 60, // 1 hour
      });
      return response;
    } else {
      // Token refresh failed, redirect to login
      const response = NextResponse.next();

      // Set a flag to indicate that middleware has run
      response.cookies.set('middleware_run', 'true', {
        httpOnly: false,
        maxAge: 60 * 60, // 1 hour
      });

      return response;
      // return NextResponse.next();
      // return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  const response = NextResponse.next();

  // Set a flag to indicate that middleware has run
  response.cookies.set('middleware_run', 'true', {
    httpOnly: false,
    maxAge: 60 * 60, // 1 hour
  });

  return response;
}

export async function middlewareTemp(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;

  if (!accessToken) {
    // Redirect to login page if no access token is present
    // do nothing
    // return NextResponse.redirect(new URL('/login', request.url));
  } else {
    const user = await validateAccessToken(accessToken);
    if (user) {
      // Token is valid, attach user to the request
      const response = NextResponse.next();
      response.headers.set('X-User-ID', user.id);
      return response;
    }
  }

  // Token is invalid, try to refresh
  console.log('Token is invalid, trying to refresh');
  const refreshResult = await handleTokenRefresh(request);

  if (refreshResult) {
    // Token refresh successful
    const { accessToken, user } = refreshResult;
    const response = NextResponse.next();
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60, // 15 minutes
    });
    response.headers.set('X-User-ID', user.id);
    return response;
  } else {
    // Token refresh failed, redirect to login
    // return NextResponse.redirect(new URL('/login', request.url));
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
