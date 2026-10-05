import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import getS3Client from '@/util/s3/GetS3Client';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';
import { maxBytesForType, supportedTypes } from '@/constants/mimeTypes';
import { createMeme } from '@/db/queries/memes';
import { HttpError, route } from '@/server/route';
import { normalizeImportUrl } from '@/server/mediaImport';
import { after } from 'next/server';
import { fingerprintAndMatch } from '@/server/mediaMatch';

// POST multipart { file, sourceUrl? }: stores a new meme. The uploader is the session user.
// sourceUrl is the post an imported file came from (see /api/import).
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

    // Normalized again rather than trusted, so only a real post link on a supported site
    // is ever stored.
    const rawSourceUrl = formData.get('sourceUrl');
    const sourceUrl =
      typeof rawSourceUrl === 'string' && rawSourceUrl ? normalizeImportUrl(rawSourceUrl).url : null;

    const id = crypto.randomUUID();
    const body = Buffer.from(await file.arrayBuffer());

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: id,
        Body: body,
        ContentType: file.type,
      })
    );

    let slug: string;
    try {
      slug = await createMeme({
        id,
        uploaderId: user.id,
        s3Key: id,
        contentType: file.type,
        sourceUrl,
      });
    } catch (error) {
      // The object is already in the bucket at this point. Without this the bucket
      // accumulates files no row will ever reference or clean up.
      await DeleteS3ObjectByKey(id);
      throw error;
    }

    // Fingerprinted after the response: the uploader is not kept waiting on it, and a
    // failure there never fails the upload.
    after(() => fingerprintAndMatch(id, body, file.type));

    return { id, slug };
  },
});
