import { db } from '@/db/db';
import { isUuid } from './ids';
import { WARNING_DISPLAYS, type WarningDisplay } from '@/constants/contentWarnings';

// Per-user settings (migration 018). One row per user per setting in user_setting, holding
// a jsonb value. Adding a setting means adding it to SETTINGS below with its default and a
// check of what a stored value may be; no migration. A setting nobody changed has no row
// and reads as its default, and setting one back to its default deletes the row.

export type Theme = 'light' | 'dark';

interface SettingSpec<T> {
  default: T;
  // Whether a stored value is still one this code understands. Anything else reads as the
  // default, so a value from an older or newer version of the app never breaks a page.
  valid: (value: unknown) => value is T;
}

function spec<T>(definition: SettingSpec<T>) {
  return definition;
}

export const SETTINGS = {
  // How memes with content warnings are shown. Was app_user.warning_display.
  warning_display: spec<WarningDisplay>({
    default: 'blur',
    valid: (value): value is WarningDisplay =>
      (WARNING_DISPLAYS as readonly unknown[]).includes(value),
  }),
  // Light or dark, following the member across devices. Null: whatever the device chose.
  theme: spec<Theme | null>({
    default: null,
    valid: (value): value is Theme | null => value === null || value === 'light' || value === 'dark',
  }),
};

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'];

export type Settings = { [K in SettingKey]: SettingValue<K> };

export function defaultSettings(): Settings {
  const settings = {} as Record<SettingKey, unknown>;
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    settings[key] = SETTINGS[key].default;
  }
  return settings as Settings;
}

// Every setting for a user, defaults filled in. A visitor (no valid id) gets the defaults.
export async function getSettings(userId: string | undefined): Promise<Settings> {
  const settings = defaultSettings() as Record<SettingKey, unknown>;
  if (!isUuid(userId)) {
    return settings as Settings;
  }
  const rows = await db<{ key: string; value: unknown }>(
    `SELECT key, value FROM user_setting WHERE user_id = $1`,
    [userId]
  );
  for (const row of rows) {
    if (row.key in SETTINGS) {
      const key = row.key as SettingKey;
      if (SETTINGS[key].valid(row.value)) {
        settings[key] = row.value;
      }
    }
  }
  return settings as Settings;
}

export async function getSetting<K extends SettingKey>(
  userId: string | undefined,
  key: K
): Promise<SettingValue<K>> {
  const fallback = SETTINGS[key].default as SettingValue<K>;
  if (!isUuid(userId)) {
    return fallback;
  }
  const [row] = await db<{ value: unknown }>(
    `SELECT value FROM user_setting WHERE user_id = $1 AND key = $2`,
    [userId, key]
  );
  return row && SETTINGS[key].valid(row.value) ? (row.value as SettingValue<K>) : fallback;
}

// Throws on a value the setting does not allow; routes check with zod first.
export async function setSetting<K extends SettingKey>(
  userId: string,
  key: K,
  value: SettingValue<K>
) {
  if (!SETTINGS[key].valid(value)) {
    throw new Error(`Invalid value for setting ${key}.`);
  }
  if (value === SETTINGS[key].default) {
    await db(`DELETE FROM user_setting WHERE user_id = $1 AND key = $2`, [userId, key]);
    return;
  }
  await db(
    `INSERT INTO user_setting (user_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()`,
    [userId, key, JSON.stringify(value)]
  );
}
