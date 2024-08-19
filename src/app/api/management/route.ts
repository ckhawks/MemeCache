import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { UserPayload, getUserFromAccessToken } from '@/auth/lib';
import { isAdmin } from '@/auth/role';
import { GetFileForMemeByS3Path } from '@/util/s3/GetFileForMeme';

// THIS FILE IS INTENDED FOR ADMIN TO DO MANUAL SHIT LIKE MIGRATION CRAP IDK
export async function GET(request: Request) {
  try {
    // disable for now
    return true;
    // validate user accessing is admin
    const user = await getUserFromAccessToken();
    if (!isAdmin(user as UserPayload)) {
      return NextResponse.json({ error: 'No access' }, { status: 400 });
    }

    const memes = await db(
      `
      SELECT * FROM "Meme";
    `,
      []
    );

    memes.map(async (meme) => {
      const file = await GetFileForMemeByS3Path(meme.s3Key);

      console.log('fileType: ' + file?.ContentType);
      const update = await db(
        `
          UPDATE "Meme"
          SET "contentType" = $1
          WHERE id=$2;
        `,
        [file?.ContentType, meme.id]
      );
    });

    return NextResponse.json(
      {
        message: 'Success',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error: ', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
