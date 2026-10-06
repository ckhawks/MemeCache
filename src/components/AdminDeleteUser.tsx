'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import main from '../app/main.module.scss';
import f from './AuthForm.module.scss';
import { api } from '@/util/api';

// Admins only: delete someone's account by anonymising it, exactly as they could themselves
// (migration 018). Their uploads and other contributions stay, credited to "deleted user".
// A reason is required and kept on the account. Typing their name confirms it. On their
// profile it goes to the tombstone; elsewhere the page refreshes in place.
export default function AdminDeleteUser(props: { userId: string; username: string; stayOnPage?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const id = useId();
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
      if (!props.stayOnPage) {
        router.replace('/me/' + encodeURIComponent(result.username));
      }
      router.refresh();
      props.onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={f.form} onSubmit={save}>
      <div className={f.field}>
        <label htmlFor={id + '-reason'} className={f.label}>
          Reason
        </label>
        <input
          id={id + '-reason'}
          className={f.input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Kept on the account and in the moderation log"
          maxLength={1000}
        />
      </div>
      <div className={f.field}>
        <label htmlFor={id + '-confirm'} className={f.label}>
          Type {props.username} to confirm
        </label>
        <input
          id={id + '-confirm'}
          className={f.input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {error && <span className={f.error}>{error}</span>}
      <div>
        <button
          type="submit"
          className={`${main.button} ${main['button-danger']}`}
          disabled={saving || !ready}
        >
          Delete account
        </button>
      </div>
    </form>
  );
}
