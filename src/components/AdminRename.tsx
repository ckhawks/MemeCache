'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import main from '../app/main.module.scss';
import f from './AuthForm.module.scss';
import m from './ModerateUser.module.scss';
import { USERNAME_MAX_LENGTH } from '@/auth/username';
import { api } from '@/util/api';

// Admins only: rename someone, say for an offensive or impersonating name. No cooldown, and
// it does not start theirs. Their old name redirects and is held like any other. On their
// profile it follows them to the new address; elsewhere (the admin users table) the page
// refreshes in place.
export default function AdminRename(props: { userId: string; username: string; stayOnPage?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(props.username);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await api<{ username: string }>('/api/admin/username', {
        body: { userId: props.userId, username: value },
      });
      if (!props.stayOnPage) {
        router.replace('/me/' + encodeURIComponent(result.username));
      }
      router.refresh();
      props.onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename them.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={f.field} onSubmit={save}>
      <label htmlFor={id} className={f.label}>
        Username
      </label>
      <div className={m.inline}>
        <input
          id={id}
          className={f.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={USERNAME_MAX_LENGTH}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          className={`${main.button} ${main['button-secondary']}`}
          disabled={saving || value.trim() === props.username}
        >
          Rename
        </button>
      </div>
      {error && <span className={f.error}>{error}</span>}
    </form>
  );
}
