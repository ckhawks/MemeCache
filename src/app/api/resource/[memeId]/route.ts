import getS3Client from '@/util/s3/GetS3Client';
import { GetObjectCommand, GetObjectCommandInput } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { getMemeMedia } from '@/db/queries/memes';

// TODO switch this to use like a short slug for resource id's instead of full uuid because its ugly

export async function GET(
  request: Request,
  props: { params: Promise<{ memeId: string }> }
) {
  const params = await props.params;
  if (params.memeId === null) {
    return new NextResponse('Please provide an id.', { status: 404 });
  }

  if (params.memeId === 'avatar') {
    return new NextResponse('Preventing accessing avatar route', {
      status: 404,
    });
  }

  // The id has to name a meme that still exists. This used to hand any key straight to
  // S3, so a deleted meme's file stayed reachable to anyone with the link.
  const media = await getMemeMedia(params.memeId);
  if (!media) {
    return new NextResponse('Image not found', { status: 404 });
  }

  // Video players ask for byte ranges, so pass the Range header through to S3 and answer
  // 206 with the part asked for. Without this every video streamed whole with no length,
  // and the browser held those connections open: a feed of videos used up the six it allows
  // per host and page navigation waited behind them. The request's signal stops the S3
  // read when the browser gives up on a response, which used to throw "Controller is
  // already closed".
  const range = request.headers.get('range') ?? undefined;
  try {
    const s3Client = getS3Client();
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: media.s3Key,
      Range: range,
    } as GetObjectCommandInput);

    const data = await s3Client.send(getObjectCommand, { abortSignal: request.signal });

    const headers: Record<string, string> = {
      'Content-Type': data.ContentType!,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (data.ContentLength !== undefined) {
      headers['Content-Length'] = String(data.ContentLength);
    }
    if (data.ContentRange) {
      headers['Content-Range'] = data.ContentRange;
    }
    return new NextResponse(data.Body?.transformToWebStream(), {
      status: data.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    if ((error as { name?: string }).name === 'InvalidRange') {
      return new NextResponse('Range not satisfiable', { status: 416 });
    }
    console.error('Error fetching image from S3:', error);
    return new NextResponse('Image not found', { status: 404 });
  }
}
