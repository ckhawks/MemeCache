import { describe, expect, it } from 'vitest';
import { getRelativeTimeString } from '@/util/datetimeFormat';

describe('getRelativeTimeString', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  it('reads a time as it is, with no timezone shift', () => {
    expect(getRelativeTimeString(new Date('2026-10-05T11:59:30Z'), now)).toBe('30 seconds ago');
    expect(getRelativeTimeString(new Date('2026-10-05T09:00:00Z'), now)).toBe('3 hours ago');
  });

  it('rounds toward zero, so 90 seconds is a minute', () => {
    expect(getRelativeTimeString(new Date('2026-10-05T11:58:30Z'), now)).toBe('1 minute ago');
  });

  it('leaves the Date it was given alone', () => {
    const date = new Date('2026-10-05T09:00:00Z');
    getRelativeTimeString(date, now);
    expect(date.toISOString()).toBe('2026-10-05T09:00:00.000Z');
  });
});
