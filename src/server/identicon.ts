import { createHash } from 'node:crypto';
import {
  PROFILE_COLORS,
  PROFILE_COLOR_SHADES,
  type ProfileColor,
} from '@/constants/profileColors';

// The avatar of a member who has not uploaded one: a symmetric pattern of blocks on a 5x5
// grid, like GitHub's, in one color on a pale tint of it. Worked out from their account id,
// so it is theirs alone, the same everywhere, and survives a rename. The color is their
// profile color when they picked one, so the two match, and otherwise one of the same
// palette picked from the id.

const GRID = 5;
// The left half and the middle column; the right half mirrors the left.
const HALF = Math.ceil(GRID / 2);
const SIZE = 100;
// Avatars are shown in circles. The grid sits inside one, so no corner block is cut off.
const CELL = 12;
const INSET = (SIZE - GRID * CELL) / 2;
// Fewer blocks than this reads as broken rather than as a pattern.
const MIN_BLOCKS = 6;

export interface Identicon {
  // Which blocks are filled, row by row, mirrored already.
  cells: boolean[][];
  color: ProfileColor;
  foreground: string;
  background: string;
}

// Mixes a #rrggbb color with white, keeping `amount` of the color.
function tint(hex: string, amount: number) {
  const channel = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(i) * amount + 255 * (1 - amount)));
  return '#' + mixed.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function identicon(seed: string, profileColor?: ProfileColor | null): Identicon {
  const hash = createHash('sha256').update(seed).digest();
  const bits = (byte: number, bit: number) => ((hash[byte] >> bit) & 1) === 1;

  const cells = Array.from({ length: GRID }, (_, row) => {
    const half = Array.from({ length: HALF }, (_, col) => bits(row * HALF + col, row % 8));
    return [...half, ...half.slice(0, GRID - HALF).reverse()];
  });

  // A sparse pattern gets its middle column filled in, which keeps it symmetric.
  const filled = cells.flat().filter(Boolean).length;
  if (filled < MIN_BLOCKS) {
    for (const row of cells) {
      row[HALF - 1] = true;
    }
  }

  const color = profileColor ?? PROFILE_COLORS[hash[31] % PROFILE_COLORS.length];
  const foreground = PROFILE_COLOR_SHADES[color].light;
  return {
    cells,
    color,
    foreground,
    background: tint(foreground, 0.16),
  };
}

export function identiconSvg(seed: string, profileColor?: ProfileColor | null): string {
  const { cells, foreground, background } = identicon(seed, profileColor);
  const rects = cells
    .flatMap((row, y) =>
      row.map((on, x) =>
        on ? `<rect x="${INSET + x * CELL}" y="${INSET + y * CELL}" width="${CELL}" height="${CELL}"/>` : ''
      )
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>` +
    `<g fill="${foreground}" shape-rendering="crispEdges">${rects}</g>` +
    `</svg>`
  );
}
