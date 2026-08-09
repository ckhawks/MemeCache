import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';
import { isModerator } from '@/auth/role';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';

// change this to be a server action

export async function POST(request: Request) {
  try {
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const memeId = formData.get('memeId');

    if (!memeId) {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    const memes = await db(`SELECT * FROM "Meme" WHERE id = $1`, [memeId]);

    if (memes.length !== 1) {
      return NextResponse.json(
        { error: 'Could not find meme by provided memeId' },
        { status: 404 }
      );
    }

    const meme = memes[0];

    // The meme has to actually belong to the caller. Checking only that the caller is
    // who they claim to be let any logged-in user delete anyone else's meme.
    if (meme.uploaderUserId !== user.id && !isModerator(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await DeleteS3ObjectByKey(meme.s3Key);
    await db(`DELETE FROM "Meme" WHERE "id" = $1`, [meme.id]);

    return NextResponse.json(
      {
        message: 'Deleted meme successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting meme:', error);
    return NextResponse.json(
      { error: 'Failed to delete meme' },
      { status: 500 }
    );
  }
}
