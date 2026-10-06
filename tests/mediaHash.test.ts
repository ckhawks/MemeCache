import { describe, expect, it } from 'vitest';
import { hammingDistance, mayRelate, pHash, relate } from '@/server/mediaHash';
import { fingerprintImage } from '@/server/mediaHashDecode';
import { copy, encode, jpeg, paintText, picture, png, stacked, withCaption, withText, type Raw } from './images';

const base = picture(1, 480, 360);
const other = picture(2, 480, 360);

async function fingerprint(image: Raw | Buffer) {
  return fingerprintImage(Buffer.isBuffer(image) ? image : await png(image));
}

async function kind(a: Raw | Buffer, b: Raw | Buffer) {
  return relate(await fingerprint(a), await fingerprint(b))?.kind ?? null;
}

function crop(image: Raw, left: number, top: number, right: number, bottom: number) {
  return encode(image)
    .extract({
      left: Math.round(image.width * left),
      top: Math.round(image.height * top),
      width: Math.round(image.width * (1 - left - right)),
      height: Math.round(image.height * (1 - top - bottom)),
    })
    .png()
    .toBuffer();
}

describe('pHash and hammingDistance', () => {
  it('counts differing bits across both halves', () => {
    expect(hammingDistance([0, 0], [0, 0])).toBe(0);
    expect(hammingDistance([0xffffffff, 0], [0, 0])).toBe(32);
    expect(hammingDistance([1, 0x80000001], [0, 1])).toBe(2);
  });

  it('gives a 32x32 gradient and its negative far-apart hashes', () => {
    const gradient = new Float32Array(32 * 32).map((_, i) => (i % 32) * 8 + Math.floor(i / 32));
    const negative = gradient.map((v) => 255 - v);
    expect(hammingDistance(pHash(gradient), pHash(gradient))).toBe(0);
    expect(hammingDistance(pHash(gradient), pHash(negative))).toBeGreaterThanOrEqual(40);
  });
});

describe('relate: duplicates', () => {
  it('sees the same file as a duplicate', async () => {
    expect(await kind(base, base)).toBe('duplicate');
  });

  it('sees through heavy JPEG compression', async () => {
    expect(await kind(base, await jpeg(base, 40))).toBe('duplicate');
  });

  it('sees through resizing to half', async () => {
    expect(await kind(base, await encode(base).resize(240).jpeg({ quality: 80 }).toBuffer())).toBe('duplicate');
  });

  it('sees through a crop of a few percent off an edge or all round', async () => {
    expect(await kind(base, await crop(base, 0.08, 0, 0, 0))).toBe('duplicate');
    expect(await kind(base, await crop(base, 0, 0, 0, 0.1))).toBe('duplicate');
    expect(await kind(base, await crop(base, 0.05, 0.05, 0.05, 0.05))).toBe('duplicate');
  });

  it('sees through an added border', async () => {
    const bordered = await encode(base)
      .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' })
      .png()
      .toBuffer();
    expect(await kind(base, bordered)).toBe('duplicate');
  });

  it('keeps a captioned meme a duplicate of its own re-encode', async () => {
    const captioned = withCaption(base, 10);
    expect(await kind(captioned, await jpeg(captioned, 50))).toBe('duplicate');
  });
});

describe('relate: exact copies', () => {
  async function exact(a: Raw | Buffer, b: Raw | Buffer) {
    return relate(await fingerprint(a), await fingerprint(b))?.exact ?? false;
  }

  it('calls the same picture re-encoded, resized or as WebP an exact copy', async () => {
    const meme = withText(base, 20);
    expect(await exact(meme, meme)).toBe(true);
    expect(await exact(meme, await jpeg(meme, 40))).toBe(true);
    expect(await exact(meme, await encode(meme).resize(240).jpeg({ quality: 80 }).toBuffer())).toBe(true);
    const captioned = withCaption(base, 10);
    expect(await exact(captioned, await encode(captioned).resize(1200).jpeg({ quality: 90 }).toBuffer())).toBe(true);
    expect(await exact(captioned, await encode(captioned).webp({ quality: 50 }).toBuffer())).toBe(true);
  });

  it('keeps a crop, a border, a watermark or one more word a duplicate but not an exact copy', async () => {
    const meme = withText(base, 20);
    const watermarked = copy(meme);
    paintText(watermarked, 99, 400, 330, 4, 3, [255, 255, 255]);
    const captioned = withCaption(base, 10);
    const oneMoreWord = copy(captioned);
    paintText(oneMoreWord, 77, 330, 54, 4, 6, [20, 20, 20]);
    const bordered = await encode(meme)
      .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' })
      .png()
      .toBuffer();

    for (const [a, b] of [
      [meme, await crop(meme, 0.02, 0, 0, 0)],
      [meme, await crop(meme, 0.05, 0.05, 0.05, 0.05)],
      [meme, bordered],
      [meme, watermarked],
      [captioned, oneMoreWord],
    ] as const) {
      const relation = relate(await fingerprint(a), await fingerprint(b));
      expect(relation?.kind).toBe('duplicate');
      expect(relation?.exact).toBe(false);
    }
  });

  it('never calls a template an exact copy', async () => {
    expect(await exact(withText(base, 20), withText(base, 30))).toBe(false);
    expect(await exact(base, withCaption(base, 10))).toBe(false);
  });
});

describe('relate: same template', () => {
  it('groups the same picture with different top and bottom text, without calling it a duplicate', async () => {
    expect(await kind(withText(base, 20), withText(base, 30))).toBe('template');
  });

  it('groups the same picture under different captions', async () => {
    expect(await kind(withCaption(base, 10), withCaption(base, 40))).toBe('template');
  });

  it('groups the bare picture with a captioned meme made from it', async () => {
    expect(await kind(base, withCaption(base, 10))).toBe('template');
  });

  it('finds the picture as one panel of a bigger meme', async () => {
    expect(await kind(await stacked(withText(base, 20), other), base)).toBe('template');
  });
});

describe('relate: unrelated', () => {
  it('leaves different pictures apart', async () => {
    expect(await kind(base, other)).toBeNull();
    expect(await kind(withText(base, 20), withText(other, 20))).toBeNull();
    expect(await kind(withCaption(base, 10), withCaption(other, 10))).toBeNull();
  });

  it('leaves a picture apart from its own negative', async () => {
    const negative = copy(base);
    negative.data.forEach((v, i) => {
      negative.data[i] = 255 - v;
    });
    expect(await kind(base, negative)).toBeNull();
  });
});

describe('mayRelate', () => {
  it('passes a duplicate to the full comparison and drops a different picture', async () => {
    const a = await fingerprint(base);
    expect(mayRelate(a.regions, (await fingerprint(await jpeg(base, 40))).regions)).toBe(true);
    expect(mayRelate(a.regions, (await fingerprint(other)).regions)).toBe(false);
  });
});
