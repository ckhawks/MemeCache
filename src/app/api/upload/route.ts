import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import getS3Client from '@/util/s3/GetS3Client';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';
import { maxBytesForType, supportedTypes } from '@/constants/mimeTypes';
import { createMeme } from '@/db/queries/memes';
import { HttpError, route } from '@/server/route';

// POST multipart { file }: stores a new meme. The uploader is the session user.
export const POST = route({
  auth: 'required',
  handler: async ({ user, request }) => {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new HttpError(400, 'No file provided.');
    }

    if (!supportedTypes.includes(file.type)) {
      throw new HttpError(415, `Unsupported file type: ${file.type || 'unknown'}.`);
    }

    const maxBytes = maxBytesForType(file.type)!;
    if (file.size > maxBytes) {
      throw new HttpError(
        413,
        `File is too large. Limit for ${file.type} is ${Math.floor(maxBytes / (1024 * 1024))}MB.`
      );
    }

    const id = crypto.randomUUID();

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: id,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      })
    );

    try {
      await createMeme({
        id,
        uploaderId: user.id,
        s3Key: id,
        contentType: file.type,
      });
    } catch (error) {
      // The object is already in the bucket at this point. Without this the bucket
      // accumulates files no row will ever reference or clean up.
      await DeleteS3ObjectByKey(id);
      throw error;
    }

    return { id };
  },
});
