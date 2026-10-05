'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import p from './Profile.module.scss';
import { USERNAME_MAX_LENGTH } from '@/auth/username';
import { api } from '@/util/api';

// Admins only: rename someone, say for an offensive or impersonating name. No cooldown, and
// it does not start theirs. Their old name redirects and is held like any other.
export default function AdminRename(props: { userId: string; username: string }) {
  const router = useRouter();
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
      router.replace('/me/' + encodeURIComponent(result.username));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename them.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={p.trustOverride} onSubmit={save}>
      <label htmlFor="admin-rename">Username:</label>
      <input
        id="admin-rename"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={USERNAME_MAX_LENGTH}
        spellCheck={false}
      />
      <button type="submit" disabled={saving || value.trim() === props.username}>
        Rename
      </button>
      {error && <span>{error}</span>}
    </form>
  );
}
