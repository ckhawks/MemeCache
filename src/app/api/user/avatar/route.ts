import { NextResponse } from 'next/server';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import getS3Client from '@/util/s3/GetS3Client';

import crypto from 'crypto';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';
import { revalidatePath } from 'next/cache';

// change this to be a server action

export async function POST(request: Request) {
  const s3Client = getS3Client();

  try {
    // TODO add reject if not within constants/mimeTypes.ts accepted range
    // TODO compress images
    // TODO limit videos to 1min
    // TODO limit files to 50Mb

    // if user has an avatar already, delete it from S3
    // upload new file to s3
    // write new avatar s3 key to user in db

    const formData = await request.formData();
    const userId = formData.get('userId');
    const file = formData.get('file') as File;

    if (userId === '') {
      return NextResponse.json(
        { error: 'No userId provided' },
        { status: 400 }
      );
    }

    // Validate that they are the right user
    const user = await getUserFromAccessToken();
    if (user?.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const currentUser = await db(
      `
        SELECT id, username, "avatarS3Key" from "User" 
        WHERE id = $1 
      `,
      [user?.id]
    );
    if (currentUser.length != 1) {
      return NextResponse.json(
        { error: 'Unable to locate user.' },
        { status: 400 }
      );
    }

    if (currentUser[0].avatarS3Key !== '') {
      // delete existing avatar from S3
      const command = new DeleteObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: currentUser[0].avatarS3Key,
      });
      await s3Client.send(command);
    }

    // generate a file name for the new avatar
    let uuid = crypto.randomUUID();
    const newAvatarKey = 'avatars/' + user.username + '-' + uuid;

    const uploadParams = {
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: newAvatarKey,
      Body: await file.arrayBuffer(),
      ContentType: file.type,
    } as PutObjectCommandInput;

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const updateUserResponse = await db(
      `UPDATE "User" SET "avatarS3Key" = $1 WHERE "id" = $2;`,
      [newAvatarKey, user?.id]
    );

    revalidatePath('/api/resource/avatar/' + user?.username);
    revalidatePath('/me/' + user?.username + '/edit');

    return NextResponse.json(
      { message: 'Avatar changed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating avatar:', error);
    return NextResponse.json(
      { error: 'Failed to update avatar' },
      { status: 500 }
    );
  }
}
