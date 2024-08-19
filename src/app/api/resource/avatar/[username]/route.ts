import { db } from '@/db/db';
import getS3Client from '@/util/s3/GetS3Client';
import { GetObjectCommand, GetObjectCommandInput } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

// TODO switch this to use like a short slug for resource id's instead of full uuid because its ugly

export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  if (params.username === null) {
    return new NextResponse('Please provide a username.', { status: 404 });
  }

  const users = await db(
    `SELECT username, id, "avatarS3Key" FROM "User"
    WHERE username = $1`,
    [params.username]
  );

  if (users.length !== 1) {
    // console.log('api/avatar/[username], users.length', users.length);
    return new NextResponse('Could not find user by that username.', {
      status: 404,
    });
  }

  const user = users[0];
  // console.log('user', user);

  if (user.avatarS3Key === undefined || user.avatarS3Key === null) {
    // return new NextResponse('User does not have an avatar set.', {
    //   status: 404,
    // });
    const s3Client = getS3Client();
    // console.log('bucket: ', process.env.MC_AWS_S3_BUCKET);
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: 'avatars/images (1).png', // temporary default
    } as GetObjectCommandInput);

    const data = await s3Client.send(getObjectCommand);

    return new NextResponse(data.Body as unknown as Buffer, {
      status: 200,
      headers: {
        'Content-Type': data.ContentType!,
        // 'Cache-Control': 'public, max-age=31536000, immutable', // optional, for caching
      },
    });
  } else {
    try {
      const s3Client = getS3Client();
      // console.log('bucket: ', process.env.MC_AWS_S3_BUCKET);
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: (user as any).avatarS3Key,
      } as GetObjectCommandInput);

      const data = await s3Client.send(getObjectCommand);

      return new NextResponse(data.Body as unknown as Buffer, {
        status: 200,
        headers: {
          'Content-Type': data.ContentType!,
          'Cache-Control': 'public, max-age=31536000, immutable', // optional, for caching
        },
      });
    } catch (error) {
      console.error('Error fetching image from S3:', error);
      return new NextResponse('Image not found', { status: 404 });
    }
  }
}

export const revalidate = 60;
