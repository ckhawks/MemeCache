'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../../main.module.scss';
import f from '@/components/AuthForm.module.scss';
import CooldownTimer from '@/components/CooldownTimer';
import { USERNAME_MAX_LENGTH, usernameProblem } from '@/auth/username';
import { api } from '@/util/api';

// The username field on the edit page. While the cooldown runs the field is read-only and
// the countdown sits under it; when it reaches zero the page refreshes and the field opens.
export default function EditUsernameForm(props: {
  username: string;
  cooldownDays: number;
  reservedDays: number;
  // ISO strings from the server: the last change, when the next is allowed, and now.
  lastChangedAt: string | null;
  availableAt: string | null;
  now: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(props.username);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const locked = props.availableAt !== null;
  const trimmed = value.trim();
  const changed = trimmed !== props.username;
  // Only complain once they have typed something different.
  const problem = changed ? usernameProblem(trimmed) : null;

  const refresh = useCallback(() => router.refresh(), [router]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changed || problem) {
      return;
    }
    setError('');
    setSaving(true);
    try {
      const result = await api<{ username: string }>('/api/user/username', {
        body: { username: trimmed },
      });
      // The page's own URL has the old name in it.
      router.replace('/me/' + encodeURIComponent(result.username) + '/edit');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your username.');
      setSaving(false);
    }
  };

  return (
    <form className={f.form} onSubmit={save}>
      <div className={f.field}>
        <label htmlFor="account-username" className={f.label}>
          Username
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="account-username"
            className={f.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={locked}
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete="username"
            spellCheck={false}
            aria-invalid={!!problem || undefined}
            aria-describedby="account-username-hint"
          />
          {!locked && (
            <button
              type="submit"
              className={styles['button']}
              disabled={!changed || !!problem || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
        {(problem || error) && (
          <div className={f.error} aria-live="polite">
            {problem || error}
          </div>
        )}
        <span id="account-username-hint" className={f.hint}>
          You can change it once every {props.cooldownDays} days. Links to your old name keep
          working, and nobody else can take it for {props.reservedDays} days.
        </span>
      </div>
      {locked && props.lastChangedAt && props.availableAt && (
        <CooldownTimer
          since={props.lastChangedAt}
          until={props.availableAt}
          now={props.now}
          label="You can change it again in"
          onDone={refresh}
        />
      )}
    </form>
  );
}
