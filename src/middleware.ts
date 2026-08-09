// middleware.ts

import { handleTokenRefresh, validateAccessToken } from '@/auth/lib';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;

  // If there's no refresh token, do nothing
  if (!refreshToken) {
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
    }

    // Token refresh failed. Left as a pass-through rather than a redirect so logged-out
    // browsing keeps working. See Phase 5 in TODO.md -- the refreshed cookie is set on
    // the response but not forwarded onto the request, so this render still sees the old
    // token and paints logged-out.
    const response = NextResponse.next();
    response.cookies.set('middleware_run', 'true', {
      httpOnly: false,
      maxAge: 60 * 60, // 1 hour
    });
    return response;
  }

  const response = NextResponse.next();

  // Set a flag to indicate that middleware has run
  response.cookies.set('middleware_run', 'true', {
    httpOnly: false,
    maxAge: 60 * 60, // 1 hour
  });

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
