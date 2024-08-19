import { handleTokenRefresh, validateAccessToken } from '@/auth/lib';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // console.log('middleware');
  const accessToken = request.cookies.get('accessToken')?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token provided' },
      { status: 401 }
    );
  }

  const user = await validateAccessToken(accessToken);
  if (user) {
    // Token is valid, attach user to the request
    (request as any).user = user;
    return NextResponse.next();
  }

  // Token is invalid, try to refresh
  console.log('Token is invalid, try to refresh');
  return handleTokenRefresh(request);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
