'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import p from './Profile.module.scss';
import { api } from '@/util/api';

// Admins only: delete someone's account by anonymising it, exactly as they could themselves
// (migration 018). Their uploads and other contributions stay, credited to "deleted user".
// A reason is required and kept on the account. Typing their name confirms it.
export default function AdminDeleteUser(props: { userId: string; username: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = reason.trim() !== '' && confirm.trim().toLowerCase() === props.username.toLowerCase();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await api<{ username: string }>('/api/admin/delete-user', {
        body: { userId: props.userId, reason },
      });
      router.replace('/me/' + encodeURIComponent(result.username));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={p.trustOverride} onSubmit={save}>
      <label htmlFor="admin-delete-reason">Delete account:</label>
      <input
        id="admin-delete-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        maxLength={1000}
      />
      <input
        aria-label="Type their username to confirm"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={`Type ${props.username}`}
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" disabled={saving || !ready}>
        Delete
      </button>
      {error && <span>{error}</span>}
    </form>
  );
}
