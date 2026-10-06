'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import f from '@/components/AuthForm.module.scss';
import s from './ProfileColorSetting.module.scss';
import { api } from '@/util/api';
import {
  PROFILE_COLORS,
  PROFILE_COLOR_SHADES,
  type ProfileColor,
} from '@/constants/profileColors';

// The tint on your profile page. A row of swatches, each in the shade the current theme
// uses, plus none. The choice saves straight away and the page refreshes.
export default function ProfileColorSetting(props: { color: ProfileColor | null }) {
  const router = useRouter();
  const [color, setColor] = useState<ProfileColor | null>(props.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const change = async (next: ProfileColor | null) => {
    setError('');
    setBusy(true);
    try {
      await api('/api/user/profile-color', { body: { color: next } });
      setColor(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the setting.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={f.form}>
      <div className={s.swatches} role="group" aria-label="Profile color">
        <button
          type="button"
          className={`${s.swatch} ${s.none}`}
          aria-pressed={color === null}
          aria-label="No color"
          title="No color"
          disabled={busy}
          onClick={() => change(null)}
        />
        {PROFILE_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            className={s.swatch}
            style={
              {
                '--swatch-light': PROFILE_COLOR_SHADES[option].light,
                '--swatch-dark': PROFILE_COLOR_SHADES[option].dark,
              } as CSSProperties
            }
            aria-pressed={color === option}
            aria-label={PROFILE_COLOR_SHADES[option].label}
            title={PROFILE_COLOR_SHADES[option].label}
            disabled={busy}
            onClick={() => change(option)}
          />
        ))}
      </div>
      <span className={f.hint}>
        {color === null
          ? 'No color: your profile keeps the plain header.'
          : `${PROFILE_COLOR_SHADES[color].label}: a soft band behind your profile header and a ring around your avatar.`}
      </span>
      {error && <span className={f.error}>{error}</span>}
    </div>
  );
}
