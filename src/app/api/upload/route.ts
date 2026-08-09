import { NextResponse } from 'next/server';
import { PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import getS3Client from '@/util/s3/GetS3Client';

import crypto from 'crypto';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';
import { maxBytesForType, supportedTypes } from '@/constants/mimeTypes';

// change this to be a server action

export async function POST(request: Request) {
  const s3Client = getS3Client();

  try {
    // The uploader is taken from the session, never from the request body.
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cacheId = formData.get('cacheId');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!cacheId) {
      return NextResponse.json(
        { error: 'No cacheId provided' },
        { status: 400 }
      );
    }

    if (!supportedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 415 }
      );
    }

    const maxBytes = maxBytesForType(file.type)!;
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `File is too large. Limit for ${file.type} is ${Math.floor(
            maxBytes / (1024 * 1024)
          )}MB.`,
        },
        { status: 413 }
      );
    }

    // The cache has to exist and belong to the uploader, otherwise anyone could drop
    // memes into someone else's cache.
    const ownedCaches = await db(
      `SELECT id FROM "Cache" WHERE id = $1 AND "ownerUserId" = $2`,
      [cacheId, user.id]
    );

    if (ownedCaches.length !== 1) {
      return NextResponse.json(
        { error: 'Cache not found, or you do not own it' },
        { status: 403 }
      );
    }

    let uuid = crypto.randomUUID();

    const uploadParams = {
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: uuid,
      Body: await file.arrayBuffer(),
      ContentType: file.type,
    } as PutObjectCommandInput;

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    try {
      await db(
        `INSERT INTO "Meme" (id, "createdAt", "uploaderUserId", "s3Key", "contentType") VALUES ($1, $2, $3, $4, $5)`,
        [uuid, new Date().toISOString(), user.id, uuid, file.type]
      );

      await db(
        `INSERT INTO "MemeCache" ("memeId", "cacheId") VALUES ($1, $2)`,
        [uuid, cacheId]
      );
    } catch (dbError) {
      // The object is already in the bucket at this point. Without this the bucket
      // accumulates files no row will ever reference or clean up.
      await DeleteS3ObjectByKey(uuid);
      throw dbError;
    }

    return NextResponse.json(
      { message: 'File uploaded successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
