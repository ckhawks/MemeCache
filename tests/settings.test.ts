import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { defaultSettings, getSetting, getSettings, setSetting } from '@/db/queries/settings';
import { getWarningDisplay, setWarningDisplay } from '@/db/queries/warnings';
import { makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

async function rows(userId: string) {
  return db<{ key: string; value: unknown }>(
    `SELECT key, value FROM user_setting WHERE user_id = $1 ORDER BY key`,
    [userId]
  );
}

describe('settings', () => {
  it('reads defaults for a member who changed nothing, and for visitors', async () => {
    const alice = await makeUser('alice');
    expect(await getSettings(alice)).toEqual(defaultSettings());
    expect(await getSettings(undefined)).toEqual({ warning_display: 'blur', theme: null });
    expect(await getSetting(alice, 'theme')).toBeNull();
    expect(await getSetting('not-a-uuid', 'warning_display')).toBe('blur');
    expect(await getSetting(randomUUID(), 'warning_display')).toBe('blur');
  });

  it('stores a change, and deletes the row when set back to the default', async () => {
    const alice = await makeUser('alice');
    await setSetting(alice, 'theme', 'dark');
    await setWarningDisplay(alice, 'show');
    expect(await getSettings(alice)).toEqual({ warning_display: 'show', theme: 'dark' });
    expect(await getWarningDisplay(alice)).toBe('show');
    expect(await rows(alice)).toHaveLength(2);

    await setSetting(alice, 'theme', null);
    await setWarningDisplay(alice, 'blur');
    expect(await rows(alice)).toEqual([]);
    expect(await getSettings(alice)).toEqual(defaultSettings());
  });

  it('refuses a value the setting does not allow, and ignores one stored by mistake', async () => {
    const alice = await makeUser('alice');
    // @ts-expect-error not a theme
    await expect(setSetting(alice, 'theme', 'purple')).rejects.toThrow();
    await db(
      `INSERT INTO user_setting (user_id, key, value) VALUES ($1, 'warning_display', '"sideways"'), ($1, 'gone', '1')`,
      [alice]
    );
    expect(await getSettings(alice)).toEqual(defaultSettings());
    expect(await getWarningDisplay(alice)).toBe('blur');
  });

  it('no longer reads app_user.warning_display', async () => {
    const alice = await makeUser('alice');
    await db(`UPDATE app_user SET warning_display = 'show' WHERE id = $1`, [alice]);
    expect(await getWarningDisplay(alice)).toBe('blur');
  });
});

describe('migration 018', () => {
  it('copies warning_display choices into user_setting, and is safe to run again', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await db(`UPDATE app_user SET warning_display = 'show' WHERE id = $1`, [alice]);
    await db(`UPDATE app_user SET warning_display = 'hover' WHERE id = $1`, [bob]);
    // Carol already chose something since: the copy does not overwrite it.
    await db(`UPDATE app_user SET warning_display = 'show' WHERE id = $1`, [carol]);
    await setWarningDisplay(carol, 'hover');
    const dave = await makeUser('dave');

    await db(readFileSync('db/migrations/018_accounts.sql', 'utf8'));

    expect(await getWarningDisplay(alice)).toBe('show');
    expect(await getWarningDisplay(bob)).toBe('hover');
    expect(await getWarningDisplay(carol)).toBe('hover');
    expect(await getWarningDisplay(dave)).toBe('blur');
    // The default is not copied: no row reads the same.
    expect(await rows(dave)).toEqual([]);
  });
});
