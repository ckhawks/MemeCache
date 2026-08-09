import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';

// change this to be a server action

export async function POST(request: Request) {
  try {
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const memeId = formData.get('memeId');
    const likeStatus = formData.get('status');

    if (!memeId) {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    if (likeStatus !== 'true' && likeStatus !== 'false') {
      return NextResponse.json(
        { error: 'status must be "true" or "false"' },
        { status: 400 }
      );
    }

    if (likeStatus === 'true') {
      const existingLike = await db(
        `SELECT id FROM "Like" WHERE "memeId" = $1 AND "userId" = $2`,
        [memeId, user.id]
      );

      if (existingLike.length > 0) {
        return NextResponse.json(
          { error: 'User has already liked this meme' },
          { status: 400 }
        );
      }

      await db(`INSERT INTO "Like" ("memeId", "userId") VALUES ($1, $2)`, [
        memeId,
        user.id,
      ]);
    } else {
      await db(`DELETE FROM "Like" WHERE "memeId" = $1 AND "userId" = $2`, [
        memeId,
        user.id,
      ]);
    }

    // get up to date number of likes to share with frontend
    const likeCountResult = await db(
      `SELECT COUNT(id) as "likeCount" FROM "Like" WHERE "memeId" = $1`,
      [memeId]
    );

    return NextResponse.json(
      {
        message: 'Like changed to ' + likeStatus + ' successfully',
        newLikeCount: likeCountResult[0].likeCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error changing like:', error);
    return NextResponse.json(
      { error: 'Failed to change like' },
      { status: 500 }
    );
  }
}
