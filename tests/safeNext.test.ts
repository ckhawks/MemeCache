import { describe, expect, it } from 'vitest';
import { safeNext } from '@/util/safeNext';

describe('safeNext', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/queue')).toBe('/queue');
    expect(safeNext('/t/cats?x=1')).toBe('/t/cats?x=1');
  });

  it('refuses anything that could leave the site', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('queue')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
