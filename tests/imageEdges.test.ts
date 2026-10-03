import { describe, expect, it } from 'vitest';
import { detectEdges, snapCrop, type Edges } from '@/util/imageEdges';

// Builds an RGBA image from a per-pixel brightness function.
function image(width: number, height: number, brightness: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = brightness(x, y);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// A busy pattern that is never blank and has no straight full-width lines.
const busy = (x: number, y: number) => ((x * 7 + y * 13) % 5) * 40 + 30;

describe('detectEdges', () => {
  it('finds a full-width boundary, like the bottom of a screenshot status bar', () => {
    const edges = detectEdges(image(100, 100, (_x, y) => (y < 20 ? 60 : 230)));
    expect(edges.rows).toContain(0.2);
    expect(edges.rows[0]).toBe(0);
    expect(edges.rows[edges.rows.length - 1]).toBe(1);
  });

  it('finds a color boundary even when brightness barely changes', () => {
    // Light blue over light gray, about the same brightness: a caption bar over a pale photo.
    const width = 60;
    const height = 60;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = y < 15 ? [160, 200, 250] : [205, 205, 205];
        data.set([r, g, b, 255], (y * width + x) * 4);
      }
    }
    expect(detectEdges({ data, width, height }).rows).toContain(0.25);
  });

  it('finds a caption bar edge that has a thin separator line under it', () => {
    // Blue bar, a 2px white rule, then a gray photo: two edges close together.
    const edges = detectEdges(
      image(100, 100, (_x, y) => (y < 20 ? 90 : y < 22 ? 255 : 160))
    );
    expect(edges.rows.some((r) => Math.abs(r - 0.2) < 0.03)).toBe(true);
  });

  it('ignores boundaries that only cross part of the image', () => {
    // A dark block a third of the width on a busy background: its top edge is not a line,
    // and the busy background is not a border either.
    const edges = detectEdges(
      image(90, 90, (x, y) => (x < 30 && y >= 40 && y < 60 ? 0 : busy(x, y)))
    );
    expect(edges.rows).not.toContain(40 / 90);
  });

  it('does not read texture as lines', () => {
    const edges = detectEdges(image(80, 80, busy));
    expect(edges.rows).toEqual([0, 1]);
    expect(edges.cols).toEqual([0, 1]);
  });

  it('finds the content box inside a uniform border', () => {
    const edges = detectEdges(
      image(100, 100, (x, y) => (x >= 10 && x < 90 && y >= 10 && y < 90 ? busy(x, y) : 255))
    );
    expect(edges.content.x).toBeCloseTo(0.1);
    expect(edges.content.y).toBeCloseTo(0.1);
    expect(edges.content.width).toBeCloseTo(0.8);
    expect(edges.content.height).toBeCloseTo(0.8);
    expect(edges.rows).toContain(0.1);
    expect(edges.cols).toContain(0.9);
  });

  it('reports the whole image as content when there is no border', () => {
    const edges = detectEdges(image(50, 50, busy));
    expect(edges.content).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('snapCrop', () => {
  const edges: Edges = {
    rows: [0, 0.2, 1],
    cols: [0, 0.5, 1],
    content: { x: 0, y: 0, width: 1, height: 1 },
  };
  const tolerance = { x: 0.03, y: 0.03 };

  it('snaps a resized edge that lands near a line', () => {
    const snapped = snapCrop({ x: 0.1, y: 0.22, width: 0.38, height: 0.5 }, null, edges, tolerance);
    expect(snapped.y).toBeCloseTo(0.2);
    expect(snapped.x + snapped.width).toBeCloseTo(0.5);
    // The bottom and left edges were not near anything and stay put.
    expect(snapped.y + snapped.height).toBeCloseTo(0.72);
    expect(snapped.x).toBeCloseTo(0.1);
  });

  it('leaves edges alone outside the tolerance', () => {
    const box = { x: 0.1, y: 0.3, width: 0.3, height: 0.3 };
    expect(snapCrop(box, null, edges, tolerance)).toEqual(box);
  });

  it('keeps the size when the crop is moved, shifting it onto the nearest line', () => {
    const previous = { x: 0.3, y: 0.4, width: 0.18, height: 0.3 };
    const moved = { x: 0.31, y: 0.4, width: 0.18, height: 0.3 };
    const snapped = snapCrop(moved, previous, edges, tolerance);
    expect(snapped.width).toBeCloseTo(0.18);
    expect(snapped.x + snapped.width).toBeCloseTo(0.5);
  });
});
