import { NextResponse } from 'next/server';
import { PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import getS3Client from '@/util/s3/GetS3Client';

import crypto from 'crypto';
import { db } from '@/db/db';

// change this to be a server action

export async function POST(request: Request) {
  const s3Client = getS3Client();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    let uuid = crypto.randomUUID();

    console.log('Upload bucket', process.env.MC_AWS_S3_BUCKET);

    const uploadParams = {
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: uuid,
      // Key: file.name, // You can change this to whatever you like, e.g., a unique identifier
      Body: await file.arrayBuffer(),
      ContentType: file.type,
    } as PutObjectCommandInput;

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const uploadResponse = await db(
      `INSERT INTO "Meme" (id, "createdAt", "uploaderUserId", "s3Key") VALUES ($1, $2, $3, $4)`,
      [uuid, new Date().toISOString(), formData.get('userId'), uuid]
    ); // todo change uploaderUserId to real

    console.log('uploadResponse', uploadResponse);

    const addToCacheResponse = await db(
      `INSERT INTO "MemeCache" ("memeId", "cacheId") VALUES ($1, $2)`,
      [uuid, formData.get('cacheId')]
    );

    console.log('addToCacheResponse', addToCacheResponse);

    // INSERT INTO public."Meme"
    // (id, "createdAt", "deletedAt", "uploaderUserId", s3key)
    // VALUES(?, '', '', ?, '');

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
