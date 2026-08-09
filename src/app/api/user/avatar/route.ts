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
import { supportedImageTypes } from '@/constants/mimeTypes';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// change this to be a server action

export async function POST(request: Request) {
  const s3Client = getS3Client();

  try {
    // if user has an avatar already, delete it from S3
    // upload new file to s3
    // write new avatar s3 key to user in db

    // The avatar owner is taken from the session, never from the request body.
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!supportedImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 415 }
      );
    }

    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: 'Avatar is too large. Limit is 2MB.' },
        { status: 413 }
      );
    }

    let currentUserResponse = await db(
      `
        SELECT id, username, "avatarS3Key" from "User" 
        WHERE id = $1 
      `,
      [user?.id]
    );

    if (currentUserResponse.length != 1) {
      return NextResponse.json(
        { error: 'Unable to locate user.' },
        { status: 400 }
      );
    }
    const currentUser = currentUserResponse[0];

    // avatarS3Key is null when the user has not had an avatar before
    if (currentUser.avatarS3Key !== '' && currentUser.avatarS3Key !== null) {
      // delete existing avatar from S3
      const command = new DeleteObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: currentUser.avatarS3Key,
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
