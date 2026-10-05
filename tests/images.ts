import sharp from 'sharp';

// Synthetic memes for the media fingerprint tests: a photo-like texture to stand in for a
// template's picture, and blocky "text" (a random pixel font) to put on it. Everything is
// generated from a seed, so the tests need no image files and no fonts.

export interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise at a few scales plus some hard-edged shapes: varied enough at every
// scale to behave like a photo.
export function picture(seed: number, width: number, height: number): Raw {
  const next = random(seed);
  const layers = [6, 14, 40].map((cells) => ({
    cells,
    grid: Array.from({ length: (cells + 1) * (cells + 1) * 3 }, () => next() * 255),
  }));
  const shapes = Array.from({ length: 8 }, () => ({
    x: next() * width,
    y: next() * height,
    r: (0.05 + next() * 0.15) * Math.min(width, height),
    color: [next() * 255, next() * 255, next() * 255],
  }));
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let value = 0;
        let weight = 0;
        for (const [i, { cells, grid }] of layers.entries()) {
          const gx = (x / width) * cells;
          const gy = (y / height) * cells;
          const x0 = Math.floor(gx);
          const y0 = Math.floor(gy);
          const fx = gx - x0;
          const fy = gy - y0;
          const at = (cx: number, cy: number) => grid[(cy * (cells + 1) + cx) * 3 + c];
          const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
          const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
          const w = 1 / (i + 1);
          value += (top * (1 - fy) + bottom * fy) * w;
          weight += w;
        }
        data[(y * width + x) * 3 + c] = value / weight;
      }
      for (const s of shapes) {
        if ((x - s.x) ** 2 + (y - s.y) ** 2 < s.r ** 2) {
          data.set(s.color, (y * width + x) * 3);
        }
      }
    }
  }
  return { data, width, height };
}

// Paints a line of blocky text: `letters` glyphs of a random 3x5 pixel font, each pixel a
// square of `scale`, in `color`, starting at (x, y). Word gaps every few letters.
export function paintText(
  image: Raw,
  seed: number,
  x: number,
  y: number,
  letters: number,
  scale: number,
  color: [number, number, number]
) {
  const next = random(seed);
  let cursor = x;
  for (let i = 0; i < letters; i++) {
    if (next() < 0.18) {
      cursor += scale * 3;
      continue;
    }
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (next() < 0.55) {
          continue;
        }
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const ix = cursor + gx * scale + px;
            const iy = y + gy * scale + py;
            if (ix >= 0 && iy >= 0 && ix < image.width && iy < image.height) {
              image.data.set(color, (iy * image.width + ix) * 3);
            }
          }
        }
      }
    }
    cursor += scale * 4;
  }
}

export function copy(image: Raw): Raw {
  return { ...image, data: Buffer.from(image.data) };
}

// Top and bottom text in white over the picture, the classic layout.
export function withText(image: Raw, seed: number): Raw {
  const out = copy(image);
  const scale = Math.round(image.height / 40);
  const letters = Math.floor(image.width / (scale * 4)) - 2;
  paintText(out, seed, scale * 2, scale * 2, letters, scale, [255, 255, 255]);
  paintText(out, seed + 1, scale * 2, image.height - scale * 8, letters, scale, [255, 255, 255]);
  return out;
}

// A white bar with dark text above the picture, the screenshot-caption layout.
export function withCaption(image: Raw, seed: number): Raw {
  const bar = Math.round(image.height * 0.25);
  const out: Raw = {
    width: image.width,
    height: image.height + bar,
    data: Buffer.alloc(image.width * (image.height + bar) * 3, 255),
  };
  image.data.copy(out.data, image.width * bar * 3);
  const scale = Math.max(2, Math.round(bar / 14));
  const letters = Math.floor(image.width / (scale * 4)) - 4;
  paintText(out, seed, scale * 3, Math.round(bar * 0.2), letters, scale, [20, 20, 20]);
  paintText(out, seed + 1, scale * 3, Math.round(bar * 0.6), Math.floor(letters * 0.6), scale, [20, 20, 20]);
  return out;
}

// `top` stacked over `bottom` (scaled to the same width), with a black gutter: a two-panel
// meme.
export async function stacked(top: Raw, bottom: Raw): Promise<Raw> {
  const lower = await sharp(bottom.data, { raw: { width: bottom.width, height: bottom.height, channels: 3 } })
    .resize(top.width, Math.round((bottom.height * top.width) / bottom.width))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gutter = 6;
  const height = top.height + gutter + lower.info.height;
  const data = Buffer.alloc(top.width * height * 3, 0);
  top.data.copy(data, 0);
  lower.data.copy(data, top.width * (top.height + gutter) * 3);
  return { data, width: top.width, height };
}

export function encode(image: Raw) {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } });
}

export async function png(image: Raw): Promise<Buffer> {
  return encode(image).png().toBuffer();
}

export async function jpeg(image: Raw, quality: number): Promise<Buffer> {
  return encode(image).jpeg({ quality }).toBuffer();
}
