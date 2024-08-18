import { getOnlineUsers } from '@/util/getOnlineUsers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await getOnlineUsers();

  const response = NextResponse.json({ onlineUsers: users });
  return response;
}

export const revalidate = 0;
