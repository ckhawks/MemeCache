import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';
import getS3Client from '@/util/s3/GetS3Client';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';

// change this to be a server action

export async function POST(request: Request) {
  // TODO verify userId is the current userId from the session

  const s3Client = getS3Client();

  try {
    const formData = await request.formData();
    const memeId = formData.get('memeId');
    const userId = formData.get('userId');

    if (userId === '') {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    const user = await getUserFromAccessToken();
    console.log('Provided user id: ', userId);
    console.log('Token user id: ', user?.id);
    if (user?.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (memeId === '') {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    // check if meme exists
    const checkMemesExists = await db(
      `
        SELECT * FROM "Meme" WHERE id = $1
      `,
      [memeId]
    );

    if (checkMemesExists.length != 1) {
      return NextResponse.json(
        { error: 'Could not find meme by provided memeId' },
        { status: 400 }
      );
    }

    const meme = checkMemesExists[0];

    // perform delete
    const deleted = await DeleteS3ObjectByKey(meme.s3Key);
    const deleteFromDb = await db(
      `
        DELETE FROM "Meme"
        WHERE "id" = $1
      `,
      [meme.id]
    );

    return NextResponse.json(
      {
        message: 'Deleted meme successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting meme:', error);
    return NextResponse.json(
      { error: 'Failed to change like' },
      { status: 500 }
    );
  }
}
