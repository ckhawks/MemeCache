import { NextResponse } from 'next/server';
import { PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import getS3Client from '@/util/s3/GetS3Client';

import crypto from 'crypto';
import { db } from '@/db/db';

export async function POST(request: Request) {
  const s3Client = getS3Client();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    let uuid = crypto.randomUUID();

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: uuid,
      // Key: file.name, // You can change this to whatever you like, e.g., a unique identifier
      Body: await file.arrayBuffer(),
      ContentType: file.type,
    } as PutObjectCommandInput;

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const uploadResponse = await db(
      `INSERT INTO "Meme" (id, "createdAt", "uploaderUserId", "s3Key") VALUES ($1, $2, $3, $4)`,
      [
        uuid,
        new Date().toISOString(),
        'b85ce070-5b57-11ef-ad9a-3ee4ea241581',
        uuid,
      ]
    ); // todo change uploaderUserId to real

    console.log(uploadResponse);

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
