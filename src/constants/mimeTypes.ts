export const supportedImageTypes = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

export const supportedVideoTypes = ['video/webm', 'video/mp4'];

export const supportedTypes = [...supportedImageTypes, ...supportedVideoTypes];

// Server-side caps. UploadComponent enforces the same numbers client-side for a nicer
// error, but the client is only a convenience -- these are the ones that count.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

export function maxBytesForType(contentType: string): number | null {
  if (supportedImageTypes.includes(contentType)) {
    return MAX_IMAGE_BYTES;
  }
  if (supportedVideoTypes.includes(contentType)) {
    return MAX_VIDEO_BYTES;
  }
  return null;
}
