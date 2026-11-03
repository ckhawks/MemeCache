import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AVATAR_SIZE, AvatarImageError, makeAvatar } from '@/server/avatarImage';

function frame(red: number, width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: { r: red, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
}

async function animation(format: 'webp' | 'gif', count: number, width: number, height: number) {
  const frames = await Promise.all(Array.from({ length: count }, (_, i) => frame(i * 20, width, height)));
  const joined = sharp(frames, { join: { animated: true } });
  return format === 'webp'
    ? joined.webp({ delay: Array(count).fill(80), loop: 0 }).toBuffer()
    : joined.gif({ delay: Array(count).fill(80), loop: 0 }).toBuffer();
}

async function read(bytes: Buffer) {
  const meta = await sharp(bytes, { animated: true }).metadata();
  return {
    format: meta.format,
    pages: meta.pages ?? 1,
    width: meta.width,
    frameHeight: meta.pageHeight ?? meta.height,
    delay: meta.delay,
  };
}

describe('makeAvatar', () => {
  it('keeps every frame and its timing of an animated WebP', async () => {
    const avatar = await read(await makeAvatar(await animation('webp', 3, 300, 200)));
    expect(avatar).toEqual({
      format: 'webp',
      pages: 3,
      width: AVATAR_SIZE,
      frameHeight: AVATAR_SIZE,
      delay: [80, 80, 80],
    });
  });

  it('turns an animated GIF into an animated WebP', async () => {
    const avatar = await read(await makeAvatar(await animation('gif', 4, 120, 160)));
    expect(avatar).toMatchObject({ format: 'webp', pages: 4, width: AVATAR_SIZE, frameHeight: AVATAR_SIZE });
  });

  it('crops a still picture to a square', async () => {
    const avatar = await read(await makeAvatar(await frame(200, 640, 360)));
    expect(avatar).toMatchObject({ format: 'webp', pages: 1, width: AVATAR_SIZE, frameHeight: AVATAR_SIZE });
  });

  it('refuses what is not a picture', async () => {
    await expect(makeAvatar(Buffer.from('not a picture'))).rejects.toBeInstanceOf(AvatarImageError);
  });

  it('refuses an animation too large to decode safely', async () => {
    // 2000 x 2000 x 11 frames is 44 million pixels, over the limit.
    const big = await animation('webp', 11, 2000, 2000);
    await expect(makeAvatar(big)).rejects.toThrow('too long or too large');
  });
});
