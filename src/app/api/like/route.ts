import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';

// change this to be a server action

export async function POST(request: Request) {
  // TODO verify userId is the current userId from the session

  // const s3Client = getS3Client();

  try {
    const formData = await request.formData();
    const memeId = formData.get('memeId');
    const userId = formData.get('userId');
    const likeStatus = formData.get('status');

    if (userId === '') {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    const user = await getUserFromAccessToken();
    if (user?.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (memeId === '') {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    if (likeStatus === '') {
      return NextResponse.json(
        { error: 'No status provided' },
        { status: 400 }
      );
    }

    if (likeStatus === 'true') {
      const existingLike = await db(
        `SELECT id FROM "Like" WHERE "memeId" = $1 AND "userId" = $2`,
        [memeId, userId]
      );

      if (existingLike.length > 0) {
        return NextResponse.json(
          { error: 'User has already liked this meme' },
          { status: 400 }
        );
      }

      const addLikeResponse = await db(
        `INSERT INTO "Like" ("memeId", "userId") VALUES ($1, $2)`,
        [memeId, userId]
      );
    } else {
      const removeLikeResponse = await db(
        `DELETE FROM "Like" WHERE "memeId" = $1 AND "userId" = $2`,
        [memeId, userId]
      );
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
