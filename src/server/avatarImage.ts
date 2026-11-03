import sharp, { type Metadata } from 'sharp';

// Avatars are cut to a centered square and scaled to this many pixels a side.
export const AVATAR_SIZE = 128;

// The most a picture may hold across all its frames before it is refused, so a long or
// huge animation cannot take the server's memory (it has 768 MB). About 170 frames at
// 480x480.
const MAX_TOTAL_PIXELS = 40_000_000;

export class AvatarImageError extends Error {}

// The uploaded picture as an avatar: a square WebP, animated if the upload was. This used
// to happen in the browser on a canvas, which keeps only the first frame, so animated GIF
// and WebP avatars never moved. WebP for everything because it holds animation and
// transparency both, and every browser the site supports shows it.
export async function makeAvatar(bytes: Buffer): Promise<Buffer> {
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { animated: true }).metadata();
  } catch {
    throw new AvatarImageError('That file is not a picture we can read.');
  }
  const pages = meta.pages ?? 1;
  const frameHeight = meta.pageHeight ?? meta.height ?? 0;
  if (!meta.width || !frameHeight) {
    throw new AvatarImageError('That file is not a picture we can read.');
  }
  if (meta.width * frameHeight * pages > MAX_TOTAL_PIXELS) {
    throw new AvatarImageError('That animation is too long or too large for an avatar. Try a shorter or smaller one.');
  }
  return sharp(bytes, { animated: true, limitInputPixels: MAX_TOTAL_PIXELS })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();
}
