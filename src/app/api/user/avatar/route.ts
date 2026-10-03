import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import getS3Client from '@/util/s3/GetS3Client';
import { supportedImageTypes } from '@/constants/mimeTypes';
import { getAvatarKey, setAvatarKey } from '@/db/queries/users';
import { HttpError, route } from '@/server/route';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// POST multipart { file }: replaces the session user's avatar.
export const POST = route({
  auth: 'required',
  handler: async ({ user, request }) => {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new HttpError(400, 'No file provided.');
    }

    if (!supportedImageTypes.includes(file.type)) {
      throw new HttpError(415, `Unsupported file type: ${file.type || 'unknown'}.`);
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new HttpError(413, 'Avatar is too large. Limit is 2MB.');
    }

    const s3 = getS3Client();
    const newAvatarKey = `avatars/${user.username}-${crypto.randomUUID()}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: newAvatarKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      })
    );

    // Swap the row first, then remove the old file, so a failure part way leaves an
    // orphaned file rather than a user pointing at a deleted one.
    const oldAvatarKey = await getAvatarKey(user.id);
    await setAvatarKey(user.id, newAvatarKey);
    if (oldAvatarKey) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.MC_AWS_S3_BUCKET,
          Key: oldAvatarKey,
        })
      );
    }

    revalidatePath('/api/resource/avatar/' + user.username);
    revalidatePath('/me/' + user.username + '/edit');

    return { ok: true };
  },
});
