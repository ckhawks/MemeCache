import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';

export default function getS3Client() {
  // MC_S3_ENDPOINT is unset in production (plain AWS S3). Locally it points at SeaweedFS,
  // which needs path-style URLs (http://localhost:8333/bucket/key).
  const endpoint = process.env.MC_S3_ENDPOINT || undefined;

  const client = new S3Client({
    region: 'us-west-1',
    apiVersion: 'latest',
    endpoint,
    forcePathStyle: endpoint !== undefined,
    credentials: {
      accessKeyId: process.env.MC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.MC_AWS_SECRET_ACCESS_KEY,
    },
    // signatureVersion: 'v4',
  } as S3ClientConfig);

  return client;
}
