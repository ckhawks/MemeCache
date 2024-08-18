import { GetObjectCommand } from '@aws-sdk/client-s3';
import getS3Client from './GetS3Client';

export async function GetFileForMemeByS3Path(s3Path: string) {
  var client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: process.env.MC_AWS_S3_BUCKET,
    Key: s3Path,
  });

  try {
    const response = await client.send(command);
    // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
    const str = await response?.Body?.transformToString();
    console.log(str);
    return response;
  } catch (err) {
    console.error(err);
  }
}
