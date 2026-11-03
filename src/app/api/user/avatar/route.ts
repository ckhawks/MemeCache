import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import getS3Client from '@/util/s3/GetS3Client';
import { MAX_AVATAR_BYTES, supportedImageTypes } from '@/constants/mimeTypes';
import { getAvatarKey, setAvatarKey } from '@/db/queries/users';
import { HttpError, route } from '@/server/route';
import { AvatarImageError, makeAvatar } from '@/server/avatarImage';

// POST multipart { file }: replaces the session user's avatar with the picture cut to a
// square and shrunk (makeAvatar), keeping an animation's frames.
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
      throw new HttpError(413, 'That picture is too large for an avatar. The limit is 8 MB.');
    }

    let avatar: Buffer;
    try {
      avatar = await makeAvatar(Buffer.from(await file.arrayBuffer()));
    } catch (error) {
      if (error instanceof AvatarImageError) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }

    const s3 = getS3Client();
    const newAvatarKey = `avatars/${user.username}-${crypto.randomUUID()}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: newAvatarKey,
        Body: avatar,
        ContentType: 'image/webp',
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

    revalidatePath('/me/' + user.username + '/edit');

    return { ok: true };
  },
});
