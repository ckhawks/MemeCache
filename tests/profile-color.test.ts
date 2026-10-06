import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { getSetting, setSetting } from '@/db/queries/settings';
import {
  isProfileColor,
  PROFILE_COLORS,
  PROFILE_COLOR_SHADES,
} from '@/constants/profileColors';
import { makeUser, resetDatabase } from './fixtures';

// The route reads the session through Next; a plain stand-in here lets it be called directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

const { POST } = await import('@/app/api/user/profile-color/route');

async function postColor(body: unknown) {
  const response = await POST(
    new Request('http://localhost/api/user/profile-color', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) }
  );
  return { status: response.status, ...((await response.json()) as object) };
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
});

describe('the palette', () => {
  it('has a label and a light and dark shade for every color', () => {
    expect(PROFILE_COLORS.length).toBeGreaterThanOrEqual(10);
    for (const color of PROFILE_COLORS) {
      const shades = PROFILE_COLOR_SHADES[color];
      expect(shades.label).not.toBe('');
      expect(shades.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(shades.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(isProfileColor('teal')).toBe(true);
    expect(isProfileColor('#ff0000')).toBe(false);
    expect(isProfileColor(null)).toBe(false);
  });
});

describe('profile_color setting', () => {
  it('is none until chosen, and set back to none deletes the row', async () => {
    const alice = await makeUser('alice');
    expect(await getSetting(alice, 'profile_color')).toBeNull();

    await setSetting(alice, 'profile_color', 'violet');
    expect(await getSetting(alice, 'profile_color')).toBe('violet');

    await setSetting(alice, 'profile_color', null);
    expect(await getSetting(alice, 'profile_color')).toBeNull();
    expect(await db(`SELECT 1 FROM user_setting WHERE user_id = $1`, [alice])).toEqual([]);
  });

  it('refuses a color outside the palette, and ignores one stored by mistake', async () => {
    const alice = await makeUser('alice');
    // @ts-expect-error not in the palette
    await expect(setSetting(alice, 'profile_color', 'chartreuse')).rejects.toThrow();
    await db(
      `INSERT INTO user_setting (user_id, key, value) VALUES ($1, 'profile_color', '"#ff00ff"')`,
      [alice]
    );
    expect(await getSetting(alice, 'profile_color')).toBeNull();
  });
});

describe('POST /api/user/profile-color', () => {
  it('needs a login', async () => {
    expect(await postColor({ color: 'teal' })).toMatchObject({ status: 401 });
  });

  it('saves a palette color for the caller, and none', async () => {
    const alice = await makeUser('alice');
    session.user = { id: alice };

    expect(await postColor({ color: 'sky' })).toEqual({ status: 200, color: 'sky' });
    expect(await getSetting(alice, 'profile_color')).toBe('sky');

    expect(await postColor({ color: null })).toEqual({ status: 200, color: null });
    expect(await getSetting(alice, 'profile_color')).toBeNull();
  });

  it('rejects anything outside the palette', async () => {
    const alice = await makeUser('alice');
    session.user = { id: alice };
    await setSetting(alice, 'profile_color', 'amber');

    expect(await postColor({ color: '#123456' })).toMatchObject({ status: 400 });
    expect(await postColor({ color: 'Teal' })).toMatchObject({ status: 400 });
    expect(await postColor({})).toMatchObject({ status: 400 });
    expect(await getSetting(alice, 'profile_color')).toBe('amber');
  });
});
