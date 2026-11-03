import { describe, expect, it } from 'vitest';
import { identicon, identiconSvg } from '@/server/identicon';
import { PROFILE_COLOR_SHADES } from '@/constants/profileColors';

const IDS = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

describe('identicon', () => {
  it('is the same every time for one id', () => {
    expect(identicon(IDS[0])).toEqual(identicon(IDS[0]));
  });

  it('is mirrored left to right and never nearly empty', () => {
    for (const id of IDS) {
      const { cells } = identicon(id);
      expect(cells).toHaveLength(5);
      for (const row of cells) {
        expect(row).toEqual([...row].reverse());
      }
      expect(cells.flat().filter(Boolean).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('varies across members, in pattern and in color', () => {
    const patterns = new Set(IDS.map((id) => JSON.stringify(identicon(id).cells)));
    const colors = new Set(IDS.map((id) => identicon(id).color));
    expect(patterns.size).toBeGreaterThan(190);
    expect(colors.size).toBe(12);
  });

  it('takes the profile color when there is one', () => {
    const icon = identicon(IDS[0], 'teal');
    expect(icon.color).toBe('teal');
    expect(icon.foreground).toBe(PROFILE_COLOR_SHADES.teal.light);
    // Same pattern either way: only the color follows the setting.
    expect(icon.cells).toEqual(identicon(IDS[0]).cells);
  });

  it('draws an SVG with a block per filled cell and nothing else in it', () => {
    const svg = identiconSvg(IDS[1]);
    const filled = identicon(IDS[1]).cells.flat().filter(Boolean).length;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    // The background rect plus one per block.
    expect(svg.match(/<rect /g)).toHaveLength(filled + 1);
    expect(svg).not.toMatch(/script|href|on\w+=/i);
  });
});
