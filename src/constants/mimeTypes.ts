export const supportedImageTypes = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

export const supportedVideoTypes = ['video/webm', 'video/mp4'];

// Types that hold one still picture (a WebP only when it has a single frame). An upload that
// is the very same picture as one of these is refused as an exact copy.
export const STILL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export const supportedTypes = [...supportedImageTypes, ...supportedVideoTypes];

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

// What a downloaded or shared meme is called: its short slug, so "egy2B3A.jpg" rather
// than the storage uuid.
export function memeFilename(slug: string, contentType: string): string {
  return `${slug}.${EXTENSIONS[contentType] ?? 'bin'}`;
}

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
