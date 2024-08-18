import { getOnlineUsers } from '@/util/getOnlineUsers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await getOnlineUsers();
  return NextResponse.json({ onlineUsers: users });
}
