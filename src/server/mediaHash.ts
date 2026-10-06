import { detectEdges, type Pixels } from '@/util/imageEdges';

// Perceptual fingerprints for spotting the same meme uploaded twice, and memes built on the
// same template. Pure functions on decoded pixels; src/server/mediaHashDecode.ts turns an
// uploaded file into pixels.
//
// Two relations, which look alike to a plain perceptual hash:
//
// - Duplicate: the same meme again, possibly re-encoded, resized, cropped a little, with a
//   border or a small watermark. Every part of it agrees, text included.
// - Same template: the same base picture with different text, or that picture used as one
//   panel of a bigger meme. Most of the picture agrees, the text does not.
//
// A meme is split into regions: the whole image (inside any uniform border), the picture
// under or over a caption bar (the white strip with text on many memes), and the parts on
// either side of a panel boundary. Each region keeps six 64-bit perceptual hashes (of the
// region and of crops of it, so a crop of up to about 10% still lands close) and a 64x64
// grayscale thumbnail. The whole image also keeps a wide 256x48 thumbnail, sharp enough
// across to tell one line of text from another.
//
// Comparing two memes: the hashes pick candidate region pairs cheaply, then the thumbnails
// are aligned (allowing a crop of up to a quarter off any edge) and compared block by block.
// Blocks are compared on their own contrast, so text that differs shows up as disagreeing
// blocks even where the rest of the picture is identical. A duplicate must also agree on
// the wide thumbnail. A minority of disagreeing blocks is the same template, most is
// unrelated.
//
// The thresholds were tuned on the memes in the dev database plus synthetic variants of
// them (JPEG at quality 40, half size, 5-10% crops, borders, watermark, different top and
// bottom text, a caption bar, stacked into a two-panel meme).

// Bump when anything below changes what a fingerprint holds, so the backfill recomputes.
export const FINGERPRINT_VERSION = 1;

// Images are analyzed at this size (longest side). Big enough for the thumbnails and the
// edge detection, small enough to be fast.
export const ANALYSIS_SIZE = 256;

export const THUMB_SIZE = 64;
export const DETAIL_WIDTH = 256;
export const DETAIL_HEIGHT = 48;

export interface Thumb {
  width: number;
  height: number;
  // Grayscale, row by row.
  pixels: Uint8Array;
}

export type RegionKind = 'whole' | 'picture' | 'panel';

export interface Region {
  kind: RegionKind;
  // Width over height of the region in the image, before the thumbnail squares it.
  aspect: number;
  // Perceptual hashes as [high 32 bits, low 32 bits]: the region itself first, then crops
  // of it.
  hashes: [number, number][];
  thumb: Thumb;
}

// The part of a region the first, cheap pass looks at.
export type RegionHashes = Pick<Region, 'hashes'>;

export interface Fingerprint {
  // The whole image first.
  regions: Region[];
  // The whole image again, wide.
  detail: Thumb;
}

export type RelationKind = 'duplicate' | 'template';

export interface Relation {
  kind: RelationKind;
  // 0 to 1, higher is closer. For ordering matches, not for display.
  score: number;
  // A duplicate that is the very same picture, only re-encoded or resized (isExactCopy).
  // The upload refuses those instead of warning. Never set on a template.
  exact?: boolean;
}

interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toGray(pixels: Pixels): Gray {
  const { data, width, height } = pixels;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return { data: gray, width, height };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

// ---------------------------------------------------------------------------------------
// Regions

// How far a pixel may stray from a border's color and still count as border. Loose enough
// for JPEG noise around a flat border.
const BORDER_TOLERANCE = 24;
// A border may take at most this much of each side. Past that it is content (a dark
// background, a white page), and the content box would depend on how it was cropped.
const MAX_BORDER = 0.35;

function lineValues(gray: Gray, line: number, from: number, to: number, horizontal: boolean) {
  const values: number[] = [];
  for (let k = from; k < to; k++) {
    values.push(horizontal ? gray.data[line * gray.width + k] : gray.data[k * gray.width + line]);
  }
  return values;
}

// Share of a line's pixels within BORDER_TOLERANCE of `color`.
function shareNear(gray: Gray, color: number, line: number, from: number, to: number, horizontal: boolean) {
  let near = 0;
  for (const v of lineValues(gray, line, from, to, horizontal)) {
    if (Math.abs(v - color) <= BORDER_TOLERANCE) {
      near++;
    }
  }
  return near / (to - from);
}

// The box inside any uniform border, within `rect`. Repeats until nothing changes, so a
// white border around a black border both go.
function trimBorder(gray: Gray, rect: Rect): Rect {
  let top = rect.y;
  let bottom = rect.y + rect.h;
  let left = rect.x;
  let right = rect.x + rect.w;
  const maxY = Math.floor(rect.h * MAX_BORDER);
  const maxX = Math.floor(rect.w * MAX_BORDER);
  const isBorder = (line: number, from: number, to: number, horizontal: boolean, color: number) =>
    shareNear(gray, color, line, from, to, horizontal) >= 0.98;

  for (let pass = 0; pass < 4; pass++) {
    const before = top + bottom + left + right;
    const topColor = median(lineValues(gray, top, left, right, true));
    while (top - rect.y < maxY && isBorder(top, left, right, true, topColor)) top++;
    const bottomColor = median(lineValues(gray, bottom - 1, left, right, true));
    while (rect.y + rect.h - bottom < maxY && isBorder(bottom - 1, left, right, true, bottomColor)) bottom--;
    const leftColor = median(lineValues(gray, left, top, bottom, false));
    while (left - rect.x < maxX && isBorder(left, top, bottom, false, leftColor)) left++;
    const rightColor = median(lineValues(gray, right - 1, top, bottom, false));
    while (rect.x + rect.w - right < maxX && isBorder(right - 1, top, bottom, false, rightColor)) right--;
    if (top + bottom + left + right === before) {
      break;
    }
  }
  if (bottom - top < 8 || right - left < 8) {
    return rect;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// A caption bar: a strip along the top or bottom whose rows are partly one flat light or
// dark color (the background behind the text), ending where the picture starts. Rows
// through a line of text still show a third or more of background between the letters;
// rows of picture almost none. Its height in rows, or 0 when there is none.
const CAPTION_BACKGROUND_SHARE = 0.2;
const CAPTION_MIN = 0.06;
const CAPTION_MAX = 0.5;

function captionBar(gray: Gray, rect: Rect, fromTop: boolean): number {
  const rowAt = (i: number) => (fromTop ? rect.y + i : rect.y + rect.h - 1 - i);
  const background = median(lineValues(gray, rowAt(0), rect.x, rect.x + rect.w, true));
  if (background > 60 && background < 195) {
    return 0;
  }
  let pictureRun = 0;
  let textRows = 0;
  const limit = Math.floor(rect.h * CAPTION_MAX);
  for (let i = 0; i < limit; i++) {
    const share = shareNear(gray, background, rowAt(i), rect.x, rect.x + rect.w, true);
    if (share >= CAPTION_BACKGROUND_SHARE) {
      pictureRun = 0;
      if (share < 0.98) {
        textRows++;
      }
      continue;
    }
    // Three picture rows in a row: the bar ended where the run started. A bar without text
    // is a border (trimBorder's job) or flat picture.
    if (++pictureRun === 3) {
      const height = i - 2;
      return height >= rect.h * CAPTION_MIN && textRows >= 2 ? height : 0;
    }
  }
  return 0;
}

// Panel boundaries away from the edges: full-width or full-height lines found by the crop
// tool's edge detection, nearest the middle first.
const PANEL_MIN = 0.3;
const MAX_SPLITS_PER_AXIS = 2;

function panelSplits(cuts: number[], start: number, size: number, imageSize: number): number[] {
  const middle = start + size / 2;
  const inside = cuts
    .map((c) => c * imageSize)
    .filter((p) => p >= start + size * PANEL_MIN && p <= start + size * (1 - PANEL_MIN))
    .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
  const picked: number[] = [];
  for (const p of inside) {
    // Lines a few pixels apart are one boundary.
    if (picked.every((q) => Math.abs(q - p) > size * 0.05)) {
      picked.push(Math.round(p));
    }
    if (picked.length === MAX_SPLITS_PER_AXIS) {
      break;
    }
  }
  return picked;
}

function findRegions(pixels: Pixels, gray: Gray): { kind: RegionKind; rect: Rect }[] {
  const whole = trimBorder(gray, { x: 0, y: 0, w: gray.width, h: gray.height });
  const regions: { kind: RegionKind; rect: Rect }[] = [{ kind: 'whole', rect: whole }];

  const top = captionBar(gray, whole, true);
  const bottom = captionBar(gray, whole, false);
  const pictureHeight = whole.h - top - bottom;
  if ((top > 0 || bottom > 0) && pictureHeight >= whole.h * 0.3) {
    regions.push({
      kind: 'picture',
      rect: trimBorder(gray, { x: whole.x, y: whole.y + top, w: whole.w, h: pictureHeight }),
    });
  }

  const edges = detectEdges(pixels);
  for (const y of panelSplits(edges.rows, whole.y, whole.h, gray.height)) {
    regions.push({ kind: 'panel', rect: trimBorder(gray, { x: whole.x, y: whole.y, w: whole.w, h: y - whole.y }) });
    regions.push({ kind: 'panel', rect: trimBorder(gray, { x: whole.x, y, w: whole.w, h: whole.y + whole.h - y }) });
  }
  for (const x of panelSplits(edges.cols, whole.x, whole.w, gray.width)) {
    regions.push({ kind: 'panel', rect: trimBorder(gray, { x: whole.x, y: whole.y, w: x - whole.x, h: whole.h }) });
    regions.push({ kind: 'panel', rect: trimBorder(gray, { x, y: whole.y, w: whole.x + whole.w - x, h: whole.h }) });
  }
  return regions;
}

// ---------------------------------------------------------------------------------------
// Hashes and thumbnails

// Area-average resample of a rectangle of the image into a cols x rows grid.
function resample(gray: Gray, rect: Rect, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let oy = 0; oy < rows; oy++) {
    const y0 = rect.y + (oy * rect.h) / rows;
    const y1 = rect.y + ((oy + 1) * rect.h) / rows;
    for (let ox = 0; ox < cols; ox++) {
      const x0 = rect.x + (ox * rect.w) / cols;
      const x1 = rect.x + ((ox + 1) * rect.w) / cols;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          sum += gray.data[y * gray.width + x] * wx * wy;
          area += wx * wy;
        }
      }
      out[oy * cols + ox] = area > 0 ? sum / area : 0;
    }
  }
  return out;
}

function makeThumb(gray: Gray, rect: Rect, width: number, height: number): Thumb {
  const pixels = new Uint8Array(width * height);
  resample(gray, rect, width, height).forEach((v, i) => {
    pixels[i] = Math.round(v);
  });
  return { width, height, pixels };
}

const DCT_SIZE = 32;
const DCT_COS = (() => {
  const table = new Float64Array(8 * DCT_SIZE);
  for (let k = 0; k < 8; k++) {
    for (let n = 0; n < DCT_SIZE; n++) {
      table[k * DCT_SIZE + n] = Math.cos((Math.PI / DCT_SIZE) * (n + 0.5) * k);
    }
  }
  return table;
})();

// pHash of a 32x32 grid: the 8x8 lowest frequencies of its DCT, one bit each for above or
// below their median. Steady under re-encoding and resizing; a crop moves it a few bits
// per percent.
export function pHash(values: Float32Array): [number, number] {
  const rows = new Float64Array(DCT_SIZE * 8);
  for (let y = 0; y < DCT_SIZE; y++) {
    for (let k = 0; k < 8; k++) {
      let sum = 0;
      for (let x = 0; x < DCT_SIZE; x++) {
        sum += values[y * DCT_SIZE + x] * DCT_COS[k * DCT_SIZE + x];
      }
      rows[y * 8 + k] = sum;
    }
  }
  const coefficients = new Float64Array(64);
  for (let ky = 0; ky < 8; ky++) {
    for (let kx = 0; kx < 8; kx++) {
      let sum = 0;
      for (let y = 0; y < DCT_SIZE; y++) {
        sum += rows[y * 8 + kx] * DCT_COS[ky * DCT_SIZE + y];
      }
      coefficients[ky * 8 + kx] = sum;
    }
  }
  // The DC term (overall brightness) is left out of the median.
  const middle = median(Array.from(coefficients.subarray(1)));
  let high = 0;
  let low = 0;
  for (let i = 0; i < 64; i++) {
    if (coefficients[i] > middle) {
      if (i < 32) {
        low |= 1 << i;
      } else {
        high |= 1 << (i - 32);
      }
    }
  }
  return [high >>> 0, low >>> 0];
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hammingDistance(a: [number, number], b: [number, number]): number {
  return popcount((a[0] ^ b[0]) >>> 0) + popcount((a[1] ^ b[1]) >>> 0);
}

// The region, then 10% off each side in turn, then 5% off all four.
const HASH_CROP = 0.1;

function hashCrops(rect: Rect): Rect[] {
  const dx = rect.w * HASH_CROP;
  const dy = rect.h * HASH_CROP;
  return [
    rect,
    { x: rect.x + dx, y: rect.y, w: rect.w - dx, h: rect.h },
    { x: rect.x, y: rect.y, w: rect.w - dx, h: rect.h },
    { x: rect.x, y: rect.y + dy, w: rect.w, h: rect.h - dy },
    { x: rect.x, y: rect.y, w: rect.w, h: rect.h - dy },
    { x: rect.x + dx / 2, y: rect.y + dy / 2, w: rect.w - dx, h: rect.h - dy },
  ];
}

// Fingerprints an image given as RGBA pixels, ideally scaled to ANALYSIS_SIZE.
export function computeFingerprint(pixels: Pixels): Fingerprint {
  const gray = toGray(pixels);
  const regions = findRegions(pixels, gray);
  return {
    regions: regions.map(({ kind, rect }) => ({
      kind,
      aspect: rect.w / rect.h,
      hashes: hashCrops(rect).map((r) => pHash(resample(gray, r, DCT_SIZE, DCT_SIZE))),
      thumb: makeThumb(gray, rect, THUMB_SIZE, THUMB_SIZE),
    })),
    detail: makeThumb(gray, regions[0].rect, DETAIL_WIDTH, DETAIL_HEIGHT),
  };
}

// ---------------------------------------------------------------------------------------
// Comparing

// The smallest distance between one region and any crop of the other, both ways round.
export function hashDistance(a: RegionHashes, b: RegionHashes): number {
  let best = 64;
  for (const h of b.hashes) {
    best = Math.min(best, hammingDistance(a.hashes[0], h));
  }
  for (const h of a.hashes) {
    best = Math.min(best, hammingDistance(h, b.hashes[0]));
  }
  return best;
}

// Region pairs further apart than this are not looked at more closely. Every duplicate and
// template pair in the tuning set was within 20; about 5% of unrelated pairs are too.
const HASH_CANDIDATE_DISTANCE = 20;

// Whether two memes are worth comparing in full: some region of one is near some region of
// the other by hashes alone. Only this runs against every stored meme.
export function mayRelate(a: RegionHashes[], b: RegionHashes[]): boolean {
  return a.some((ra) => b.some((rb) => hashDistance(ra, rb) <= HASH_CANDIDATE_DISTANCE));
}

// The thumbnail's value at (u, v) in its unit square.
function bilinear(thumb: Thumb, u: number, v: number): number {
  const { pixels, width, height } = thumb;
  const x = Math.min(Math.max(u * width - 0.5, 0), width - 1);
  const y = Math.min(Math.max(v * height - 0.5, 0), height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = pixels[y0 * width + x0] * (1 - fx) + pixels[y0 * width + x1] * fx;
  const bottom = pixels[y1 * width + x0] * (1 - fx) + pixels[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// Where b sits in a: [left, top, right, bottom] in a's unit square. Edges outside 0..1 mean
// b shows more than a does (a is the cropped one).
type Placement = [number, number, number, number];

interface Samples {
  a: Float64Array;
  b: Float64Array;
  // 1 where the sample falls inside both.
  inside: Uint8Array;
  count: number;
}

// Samples both thumbnails on a cols x rows grid over b, mapped into a by the placement.
function sample(a: Thumb, b: Thumb, place: Placement, cols: number, rows: number): Samples {
  const [left, top, right, bottom] = place;
  const out: Samples = {
    a: new Float64Array(cols * rows),
    b: new Float64Array(cols * rows),
    inside: new Uint8Array(cols * rows),
    count: 0,
  };
  for (let j = 0; j < rows; j++) {
    const v = (j + 0.5) / rows;
    const ay = top + v * (bottom - top);
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols;
      const ax = left + u * (right - left);
      if (ax < 0 || ax > 1 || ay < 0 || ay > 1) {
        continue;
      }
      const k = j * cols + i;
      out.a[k] = bilinear(a, ax, ay);
      out.b[k] = bilinear(b, u, v);
      out.inside[k] = 1;
      out.count++;
    }
  }
  return out;
}

// Normalized cross-correlation over the samples inside both: 1 is identical up to
// brightness and contrast.
function correlation(s: Samples): number {
  let meanA = 0;
  let meanB = 0;
  for (let k = 0; k < s.inside.length; k++) {
    if (s.inside[k]) {
      meanA += s.a[k];
      meanB += s.b[k];
    }
  }
  meanA /= s.count;
  meanB /= s.count;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let k = 0; k < s.inside.length; k++) {
    if (s.inside[k]) {
      const da = s.a[k] - meanA;
      const db = s.b[k] - meanB;
      ab += da * db;
      aa += da * da;
      bb += db * db;
    }
  }
  if (aa < 1e-6 || bb < 1e-6) {
    return 0;
  }
  return ab / Math.sqrt(aa * bb);
}

// How far each edge may move: a crop of up to this much off any side, either image.
const MAX_SHIFT = 0.25;
// The alignment is scored on a grid this many times coarser than the thumbnail; the
// comparison after it uses the full one.
const ALIGN_COARSENESS = 4;
// At least this much of b must land inside a.
const MIN_OVERLAP = 0.6;

// Nudges each edge of the placement in shrinking steps while the correlation improves.
function refine(
  a: Thumb,
  b: Thumb,
  start: Placement,
  steps: number[],
  coarseness = ALIGN_COARSENESS
): { place: Placement; correlation: number } {
  const cols = b.width / coarseness;
  const rows = b.height / coarseness;
  const score = (place: Placement) => {
    const s = sample(a, b, place, cols, rows);
    return s.count < cols * rows * MIN_OVERLAP ? -1 : correlation(s);
  };
  let best = start;
  let bestScore = score(start);
  for (const step of steps) {
    for (let round = 0, improved = true; improved && round < 20; round++) {
      improved = false;
      for (let edge = 0; edge < 4; edge++) {
        for (const delta of [-step, step]) {
          const next = [...best] as Placement;
          next[edge] += delta;
          const limit = edge < 2 ? next[edge] : next[edge] - 1;
          if (Math.abs(limit) > MAX_SHIFT) {
            continue;
          }
          const s = score(next);
          if (s > bestScore + 1e-9) {
            bestScore = s;
            best = next;
            improved = true;
          }
        }
      }
    }
  }
  return { place: best, correlation: bestScore };
}

// Finds the placement of region b in region a that correlates best: a few starting guesses
// (the same framing, and crops implied by a different aspect ratio), each refined.
function align(a: Region, b: Region): { place: Placement; correlation: number } {
  const starts: Placement[] = [[0, 0, 1, 1]];
  // Above 1: b is wider for its height, so b lost height or a lost width.
  const ratio = b.aspect / a.aspect;
  if (Math.abs(ratio - 1) > 0.02) {
    const height = 1 / ratio;
    if (Math.abs(1 - height) <= MAX_SHIFT * 2) {
      starts.push([0, 0, 1, height], [0, 1 - height, 1, 1], [0, (1 - height) / 2, 1, (1 + height) / 2]);
    }
    const width = ratio;
    if (Math.abs(1 - width) <= MAX_SHIFT * 2) {
      starts.push([0, 0, width, 1], [1 - width, 0, 1, 1], [(1 - width) / 2, 0, (1 + width) / 2, 1]);
    }
  }
  // Only the most promising start is refined all the way.
  let best = refine(a.thumb, b.thumb, starts[0], []);
  for (const start of starts.slice(1)) {
    const candidate = refine(a.thumb, b.thumb, start, []);
    if (candidate.correlation > best.correlation) {
      best = candidate;
    }
  }
  return refine(a.thumb, b.thumb, best.place, [0.04, 0.02, 0.01, 0.005, 0.0025]);
}

// Blocks of BLOCK x BLOCK samples are compared on their own. A block whose contrast is
// below FLAT in both images (sky, a white background) says nothing and is skipped.
const BLOCK = 8;
const FLAT = 10;
// A textured block agrees when it correlates at least this well and neither image has
// more than CONTRAST_RATIO times the other's contrast there (text added over a flat area).
const BLOCK_CORRELATION = 0.5;
const CONTRAST_RATIO = 6;
// On the wide thumbnail blocks are 8 across and 4 down, about one line of caption text, and
// different words there still correlate loosely (dark letters on the same light rows), so
// agreeing takes more.
const DETAIL_BLOCK_HEIGHT = 4;
const DETAIL_BLOCK_CORRELATION = 0.8;
// Rows of blocks with fewer textured blocks than this are not judged on their own.
const MIN_ROW_BLOCKS = 4;

interface BlockComparison {
  // Share of the textured blocks that disagree.
  disagreement: number;
  // Share of all blocks that are textured and agree: how much real content matched.
  agreement: number;
  // The row of blocks with the most disagreeing blocks, as a share of the row. A line of
  // text that says something else fills most of a row; resampling noise after a crop or a
  // border is scattered.
  worstRow: number;
}

function compareBlocks(
  a: Thumb,
  b: Thumb,
  place: Placement,
  minCorrelation: number,
  blockWidth = BLOCK,
  blockHeight = BLOCK
): BlockComparison {
  const cols = b.width;
  const s = sample(a, b, place, cols, b.height);
  const blocksX = cols / blockWidth;
  const blocksY = b.height / blockHeight;
  let textured = 0;
  let disagree = 0;
  let worstRow = 0;
  for (let by = 0; by < blocksY; by++) {
    const rowTextured = textured;
    const rowDisagree = disagree;
    for (let bx = 0; bx < blocksX; bx++) {
      const ks: number[] = [];
      for (let j = by * blockHeight; j < (by + 1) * blockHeight; j++) {
        for (let i = bx * blockWidth; i < (bx + 1) * blockWidth; i++) {
          if (s.inside[j * cols + i]) {
            ks.push(j * cols + i);
          }
        }
      }
      // Blocks mostly outside the overlap are left out.
      if (ks.length < blockWidth * blockHeight * 0.75) {
        continue;
      }
      let meanA = 0;
      let meanB = 0;
      for (const k of ks) {
        meanA += s.a[k];
        meanB += s.b[k];
      }
      meanA /= ks.length;
      meanB /= ks.length;
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (const k of ks) {
        const da = s.a[k] - meanA;
        const db = s.b[k] - meanB;
        ab += da * db;
        aa += da * da;
        bb += db * db;
      }
      const contrastA = Math.sqrt(aa / ks.length);
      const contrastB = Math.sqrt(bb / ks.length);
      if (Math.max(contrastA, contrastB) < FLAT) {
        continue;
      }
      textured++;
      const r = ab / Math.sqrt(aa * bb || 1);
      const ratio = Math.max(contrastA, contrastB) / Math.max(1, Math.min(contrastA, contrastB));
      if (r < minCorrelation || ratio > CONTRAST_RATIO) {
        disagree++;
      }
    }
    if (textured - rowTextured >= MIN_ROW_BLOCKS) {
      worstRow = Math.max(worstRow, (disagree - rowDisagree) / blocksX);
    }
  }
  return {
    disagreement: textured > 0 ? disagree / textured : 1,
    agreement: (textured - disagree) / (blocksX * blocksY),
    worstRow,
  };
}

export interface RegionComparison {
  correlation: number;
  disagreement: number;
  agreement: number;
  // The largest crop the alignment needed, as a share of the side.
  shift: number;
  place: Placement;
}

// The largest share of a side that one image has and the other lacks, measured on whichever
// image it is a bigger share of, so the answer is the same both ways round.
function placementShift([left, top, right, bottom]: Placement): number {
  const width = right - left;
  const height = bottom - top;
  return Math.max(
    Math.abs(left),
    Math.abs(top),
    Math.abs(right - 1),
    Math.abs(bottom - 1),
    Math.abs(left) / width,
    Math.abs(top) / height,
    Math.abs(right - 1) / width,
    Math.abs(bottom - 1) / height
  );
}

export function compareRegions(a: Region, b: Region): RegionComparison {
  const { place, correlation } = align(a, b);
  const shift = placementShift(place);
  if (correlation < 0) {
    return { correlation, disagreement: 1, agreement: 0, shift, place };
  }
  return { correlation, shift, place, ...compareBlocks(a.thumb, b.thumb, place, BLOCK_CORRELATION) };
}

// Duplicate: aligned, the pictures correlate closely and next to no block disagrees. A
// crop bigger than DUPLICATE_SHIFT off a side has lost something that matters (most often
// a caption bar), and makes it a different meme on the same picture.
const DUPLICATE_CORRELATION = 0.85;
const DUPLICATE_DISAGREEMENT = 0.15;
const DUPLICATE_SHIFT = 0.13;
// And on the wide thumbnail no row of blocks may mostly disagree.
const DUPLICATE_DETAIL_ROW = 0.7;
// Same template: a looser correlation, under half the textured blocks disagree, and the
// blocks that agree cover a fair part of the picture (two white screenshots agreeing on
// their margins is not a template).
const TEMPLATE_CORRELATION = 0.7;
const TEMPLATE_DISAGREEMENT = 0.55;
const TEMPLATE_AGREEMENT = 0.25;

function isDuplicate(c: RegionComparison) {
  return (
    c.correlation >= DUPLICATE_CORRELATION &&
    c.disagreement <= DUPLICATE_DISAGREEMENT &&
    c.shift <= DUPLICATE_SHIFT
  );
}

function isTemplate(c: RegionComparison) {
  return (
    c.correlation >= TEMPLATE_CORRELATION &&
    c.disagreement <= TEMPLATE_DISAGREEMENT &&
    c.agreement >= TEMPLATE_AGREEMENT
  );
}

// The wide thumbnails compared at the placement the whole images aligned at, refined at
// full resolution first. At 64x64 a line of text is a gray smudge, so two captions with
// different words can pass as the same there.
export function detailWorstRow(a: Fingerprint, b: Fingerprint, place: Placement): number {
  const fine = refine(a.detail, b.detail, place, [0.005, 0.0025, 0.00125], 1);
  return compareBlocks(a.detail, b.detail, fine.place, DETAIL_BLOCK_CORRELATION, BLOCK, DETAIL_BLOCK_HEIGHT)
    .worstRow;
}

// Exact copy: the whole images line up with no crop, and on the wide thumbnail next to no
// block disagrees anywhere, not even one row's worth. What survives that is the same file
// re-encoded, resized or given a plain border; a crop, a watermark or a changed word does
// not. The upload refuses these, so every limit sits well inside the duplicate ones: a
// false refusal costs more than a missed one, which still gets the duplicate warning.
// On the synthetic variants a re-encode, a resize or a WebP copy scored 0 on both detail
// measures, while one added word in a caption scored about 0.02 overall and 0.09 in its row,
// and a corner watermark 0.015 and 0.06 to 0.09. One stray block in a row of 32 is allowed.
const EXACT_CORRELATION = 0.97;
const EXACT_DISAGREEMENT = 0.02;
const EXACT_SHIFT = 0.01;
// Width over height may differ by this share, from rounding when it was resized.
const EXACT_ASPECT = 0.01;
const EXACT_DETAIL_DISAGREEMENT = 0.008;
const EXACT_DETAIL_ROW = 0.04;

export interface Exactness {
  correlation: number;
  disagreement: number;
  shift: number;
  aspect: number;
  detailDisagreement: number;
  detailWorstRow: number;
}

// What isExactCopy judges, measured on the whole images. `whole` is their comparison when
// the caller has it already.
export function measureExactness(
  a: Fingerprint,
  b: Fingerprint,
  whole = compareRegions(a.regions[0], b.regions[0])
): Exactness {
  const fine = refine(a.detail, b.detail, whole.place, [0.005, 0.0025, 0.00125], 1);
  const detail = compareBlocks(a.detail, b.detail, fine.place, DETAIL_BLOCK_CORRELATION, BLOCK, DETAIL_BLOCK_HEIGHT);
  return {
    correlation: whole.correlation,
    disagreement: whole.disagreement,
    shift: whole.shift,
    aspect: Math.abs(a.regions[0].aspect / b.regions[0].aspect - 1),
    detailDisagreement: detail.disagreement,
    detailWorstRow: detail.worstRow,
  };
}

export function isExactCopy(a: Fingerprint, b: Fingerprint, whole?: RegionComparison): boolean {
  const m = measureExactness(a, b, whole);
  return (
    m.correlation >= EXACT_CORRELATION &&
    m.disagreement <= EXACT_DISAGREEMENT &&
    m.shift <= EXACT_SHIFT &&
    m.aspect <= EXACT_ASPECT &&
    m.detailDisagreement <= EXACT_DETAIL_DISAGREEMENT &&
    m.detailWorstRow <= EXACT_DETAIL_ROW
  );
}

// Whether `other` is this meme with its caption bar cut off: it fits the picture under the
// caption better than it fits the whole. A thin bar is within the crop a duplicate may
// have, so the whole comparison alone would call them the same meme.
function isCaptionRemoved(meme: Fingerprint, other: Region, wholeShift: number): boolean {
  return meme.regions.some((region) => {
    if (region.kind !== 'picture') {
      return false;
    }
    const c = compareRegions(region, other);
    return isDuplicate(c) && c.shift < wholeShift;
  });
}

// How two memes relate, or null when they do not.
export function relate(a: Fingerprint, b: Fingerprint): Relation | null {
  const wholeA = a.regions[0];
  const wholeB = b.regions[0];

  let whole: RegionComparison | null = null;
  if (hashDistance(wholeA, wholeB) <= HASH_CANDIDATE_DISTANCE) {
    whole = compareRegions(wholeA, wholeB);
    if (
      isDuplicate(whole) &&
      detailWorstRow(a, b, whole.place) <= DUPLICATE_DETAIL_ROW &&
      !isCaptionRemoved(a, wholeB, whole.shift) &&
      !isCaptionRemoved(b, wholeA, whole.shift)
    ) {
      return {
        kind: 'duplicate',
        score: whole.correlation * (1 - whole.disagreement),
        exact: isExactCopy(a, b, whole),
      };
    }
  }

  // Any region of one against any of the other: a panel of a bigger meme, the picture
  // under a caption, or the whole thing with different text.
  let best: Relation | null = null;
  for (const ra of a.regions) {
    for (const rb of b.regions) {
      if (hashDistance(ra, rb) > HASH_CANDIDATE_DISTANCE) {
        continue;
      }
      const c = ra === wholeA && rb === wholeB && whole ? whole : compareRegions(ra, rb);
      if (isDuplicate(c) || isTemplate(c)) {
        const score = c.correlation * (1 - c.disagreement);
        if (!best || score > best.score) {
          best = { kind: 'template', score };
        }
      }
    }
  }
  return best;
}
