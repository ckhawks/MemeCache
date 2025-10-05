import { db } from '@/db/db';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  const { memeId } = params;

  console.log('Fetching meme data for id:', memeId);
  if (!memeId) {
    return new NextResponse('Please provide a memeId.', { status: 400 });
  }

  const memeData = await db(
    `
      SELECT 
        m.*, 
        u.username, 
        u.id as "userId", 
        c.name as "cacheName",
        COUNT(l.id) as "likeCount"
      FROM "Meme" m
      LEFT JOIN "User" u ON u.id = m."uploaderUserId"
      LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
      LEFT JOIN "Cache" c ON c.id = mc."cacheId"
      LEFT JOIN "Like" l ON l."memeId" = m.id
      WHERE m.id = $1
      GROUP BY m.id, u.username, u.id, c.name
      `,
    [memeId.toString()]
  );

  return NextResponse.json(memeData[0] || null);
}
