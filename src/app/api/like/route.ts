import { NextResponse } from 'next/server';
import { setLike } from '@/db/queries/likes';
import { getMeme } from '@/db/queries/memes';
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

    const meme = await getMeme(memeId.toString());
    if (!meme) {
      return NextResponse.json({ error: 'Meme not found' }, { status: 404 });
    }

    const newLikeCount = await setLike(meme.id, user.id, likeStatus === 'true');

    return NextResponse.json(
      {
        message: 'Like changed to ' + likeStatus + ' successfully',
        newLikeCount,
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
