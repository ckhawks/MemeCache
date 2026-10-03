import { getProfile } from '@/db/queries/users';
import getS3Client from '@/util/s3/GetS3Client';
import { GetObjectCommand, GetObjectCommandInput } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

// TODO switch this to use like a short slug for resource id's instead of full uuid because its ugly

// Avatars were served with no caching, so every page refetched every avatar from storage and
// they popped in late. The URL is per username, not per image, so it cannot be immutable:
// browsers reuse it for 10 minutes and revalidate in the background for a week after. The
// edit page busts it with ?timeStamp, so your own change shows at once.
const AVATAR_CACHE = 'public, max-age=600, stale-while-revalidate=604800';

export async function GET(
  request: Request,
  props: { params: Promise<{ username: string }> }
) {
  const params = await props.params;
  if (params.username === null) {
    return new NextResponse('Please provide a username.', { status: 404 });
  }

  const user = await getProfile(params.username);

  if (!user) {
    return new NextResponse('Could not find user by that username.', {
      status: 404,
    });
  }

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

    return new NextResponse(data.Body?.transformToWebStream(), {
      status: 200,
      headers: {
        'Content-Type': data.ContentType!,
        'Cache-Control': AVATAR_CACHE,
      },
    });
  } else {
    try {
      const s3Client = getS3Client();
      // console.log('bucket: ', process.env.MC_AWS_S3_BUCKET);
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.MC_AWS_S3_BUCKET,
        Key: user.avatarS3Key,
      } as GetObjectCommandInput);

      const data = await s3Client.send(getObjectCommand);

      return new NextResponse(data.Body?.transformToWebStream(), {
        status: 200,
        headers: {
          'Content-Type': data.ContentType!,
          'Cache-Control': AVATAR_CACHE,
        },
      });
    } catch (error) {
      console.error('Error fetching image from S3:', error);
      return new NextResponse('Image not found', { status: 404 });
    }
  }
}

export const revalidate = 60;
