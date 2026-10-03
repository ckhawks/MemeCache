// Edge detection for the upload crop tool. Finds the horizontal and vertical lines a crop
// should snap to: hard boundaries that run across most of the image (a screenshot's status
// bar, a panel border, the edge of a caption block) and where content starts inside a
// uniform border (white bars around a meme). Pure functions on RGBA pixel data, so they are
// testable without a browser.
//
// Positions are fractions of the image size (0 to 1), matching react-image-crop's
// percent units divided by 100, and independent of the size the image is displayed at.

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Edges {
  // Row boundaries, as fractions of height. Always includes 0 and 1.
  rows: number[];
  // Column boundaries, as fractions of width. Always includes 0 and 1.
  cols: number[];
  // The box inside any uniform border, as fractions. The whole image when there is none.
  content: Box;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// How different two neighboring pixels must be to count as part of a boundary: the largest
// difference in any one color channel (0-255). Color, not brightness: a light blue caption
// bar over a pale photo is an obvious edge with almost no change in brightness.
const PIXEL_JUMP = 40;
// How much of a row or column must jump for the boundary to count as a line.
const LINE_COVERAGE = 0.6;
// How far a pixel may stray from its row's typical color and still count as blank.
const BLANK_TOLERANCE = 14;

function grayscale(pixels: Pixels): Float32Array {
  const { data, width, height } = pixels;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

// Texture check: within this many lines either side of a candidate, at most
// MAX_STRONG_NEARBY lines may be strong. A thin rule line (a 1-2px separator under a caption
// bar) is two or three strong lines close together; texture is strong almost everywhere.
const TEXTURE_RADIUS = 5;
const MAX_STRONG_NEARBY = 5;

// Lines are compared this far apart, so a soft edge spread over a couple of lines (an
// upscaled, blurry meme, or the smoothing of the downscale before analysis) still counts.
const EDGE_SPAN = 2;

// Boundaries where most of a line jumps in color across EDGE_SPAN lines. `jump(line, k)` is
// the change at pixel k between line `line - EDGE_SPAN` and line `line`. `lines` and
// `length` give the extent.
//
// A real boundary stands out from its neighborhood. A textured area (grass, noise, a busy
// photo) jumps on nearly every line, so without that check it would read as dozens of lines.
function lineBoundaries(
  jump: (line: number, k: number) => number,
  lines: number,
  length: number
): number[] {
  const coverage = new Float32Array(lines + 2);
  for (let i = EDGE_SPAN; i < lines; i++) {
    let jumps = 0;
    for (let k = 0; k < length; k++) {
      if (jump(i, k) > PIXEL_JUMP) {
        jumps++;
      }
    }
    coverage[i] = jumps / length;
  }

  const found: number[] = [];
  for (let i = 1; i < lines; i++) {
    if (coverage[i] < LINE_COVERAGE) {
      continue;
    }
    let strongNearby = 0;
    for (let j = Math.max(1, i - TEXTURE_RADIUS); j <= Math.min(lines - 1, i + TEXTURE_RADIUS); j++) {
      if (coverage[j] >= LINE_COVERAGE) {
        strongNearby++;
      }
    }
    if (strongNearby <= MAX_STRONG_NEARBY) {
      // A sharp edge between lines e-1 and e registers at i = e and i = e + 1; the first
      // of those (kept when nearby hits merge) is exactly the boundary.
      found.push(i);
    }
  }
  return found;
}

// A line is blank when every pixel sits close to the line's median brightness.
function isBlank(get: (k: number) => number, length: number): boolean {
  const values = Array.from({ length }, (_, k) => get(k)).sort((a, b) => a - b);
  const median = values[Math.floor(length / 2)];
  return values[0] >= median - BLANK_TOLERANCE && values[length - 1] <= median + BLANK_TOLERANCE;
}

// Collapses boundaries a few pixels apart (an anti-aliased edge reads as two or three
// neighboring jumps) into one, and turns pixel positions into fractions.
function normalize(positions: number[], size: number): number[] {
  const merged: number[] = [];
  for (const p of [...positions].sort((a, b) => a - b)) {
    if (merged.length === 0 || p - merged[merged.length - 1] > EDGE_SPAN + 1) {
      merged.push(p);
    }
  }
  const fractions = merged.map((p) => p / size).filter((f) => f > 0 && f < 1);
  return [0, ...fractions, 1];
}

export function detectEdges(pixels: Pixels): Edges {
  const { width, height } = pixels;
  const gray = grayscale(pixels);
  const at = (x: number, y: number) => gray[y * width + x];

  const { data } = pixels;
  // Largest channel difference between two pixels, by pixel index.
  const colorJump = (a: number, b: number) =>
    Math.max(
      Math.abs(data[a * 4] - data[b * 4]),
      Math.abs(data[a * 4 + 1] - data[b * 4 + 1]),
      Math.abs(data[a * 4 + 2] - data[b * 4 + 2])
    );

  const rowLines = lineBoundaries(
    (y, x) => colorJump(y * width + x, (y - EDGE_SPAN) * width + x),
    height,
    width
  );
  const colLines = lineBoundaries(
    (x, y) => colorJump(y * width + x, y * width + x - EDGE_SPAN),
    width,
    height
  );

  // Content box: skip blank rows and columns in from each side.
  const blankRow = (y: number) => isBlank((x) => at(x, y), width);
  const blankCol = (x: number) => isBlank((y) => at(x, y), height);
  let top = 0;
  while (top < height - 1 && blankRow(top)) top++;
  let bottom = height;
  while (bottom > top + 1 && blankRow(bottom - 1)) bottom--;
  let left = 0;
  while (left < width - 1 && blankCol(left)) left++;
  let right = width;
  while (right > left + 1 && blankCol(right - 1)) right--;

  return {
    rows: normalize([...rowLines, top, bottom], height),
    cols: normalize([...colLines, left, right], width),
    content: {
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    },
  };
}

function nearest(value: number, candidates: number[], tolerance: number): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    if (Math.abs(c - value) <= tolerance && (best === null || Math.abs(c - value) < Math.abs(best - value))) {
      best = c;
    }
  }
  return best;
}

// Snaps a crop's edges to detected lines within `tolerance` (fractions per axis).
// When the crop was moved rather than resized (same size as before), it shifts the whole
// box by the smaller of its two edge snaps instead, so moving never changes its size.
export function snapCrop(
  next: Box,
  previous: Box | null,
  edges: Edges,
  tolerance: { x: number; y: number }
): Box {
  const moved =
    previous !== null &&
    Math.abs(next.width - previous.width) < 1e-6 &&
    Math.abs(next.height - previous.height) < 1e-6;

  const snapAxis = (start: number, size: number, candidates: number[], tol: number) => {
    const s = nearest(start, candidates, tol);
    const e = nearest(start + size, candidates, tol);
    if (s === null && e === null) {
      // Nothing to snap to: hand the box back untouched, not recomputed through floats.
      return [start, size];
    }
    if (moved) {
      const ds = s === null ? Infinity : s - start;
      const de = e === null ? Infinity : e - (start + size);
      const shift = Math.abs(ds) <= Math.abs(de) ? ds : de;
      return Number.isFinite(shift) ? [start + shift, size] : [start, size];
    }
    const newStart = s ?? start;
    const newEnd = e ?? start + size;
    return newEnd > newStart ? [newStart, newEnd - newStart] : [start, size];
  };

  const [x, width] = snapAxis(next.x, next.width, edges.cols, tolerance.x);
  const [y, height] = snapAxis(next.y, next.height, edges.rows, tolerance.y);
  return { x, y, width, height };
}
