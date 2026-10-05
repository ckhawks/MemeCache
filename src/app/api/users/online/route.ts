import { getOnlineUsers } from '@/util/getOnlineUsers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await getOnlineUsers();

  const response = NextResponse.json({ onlineUsers: users });
  return response;
}

// Who is online now, read per request. With `revalidate` and no request data this route was
// prerendered at build time: it queried the database during `next build` and served the
// list from the build for up to a minute.
export const dynamic = 'force-dynamic';
