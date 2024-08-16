import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';

export default function getS3Client() {
  const client = new S3Client({
    region: 'us-west-1',
    apiVersion: 'latest',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // signatureVersion: 'v4',
  } as S3ClientConfig);

  return client;
}
