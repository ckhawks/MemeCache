'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import main from '../../../main.module.scss';
import f from '@/components/AuthForm.module.scss';
import { api } from '@/util/api';

// Deleting your own account (migration 018). Type your username and your password, then
// the account is anonymised and you are logged out. The button stays disabled until the
// name matches, so it cannot be pressed by accident.
export default function DeleteAccountForm(props: { username: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = confirm.trim().toLowerCase() === props.username.toLowerCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/user/delete', { body: { confirm, password } });
      // The cookie is gone; refresh so the navigation bar forgets the session too.
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.');
      setBusy(false);
    }
  };

  return (
    <form className={f.form} onSubmit={submit}>
      <div className={f.field}>
        <label htmlFor="delete-confirm" className={f.label}>
          Type your username, {props.username}, to confirm
        </label>
        <input
          id="delete-confirm"
          className={f.input}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className={f.field}>
        <label htmlFor="delete-password" className={f.label}>
          Password
        </label>
        <input
          id="delete-password"
          type="password"
          className={f.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && <span className={f.error}>{error}</span>}
      <div>
        <button
          type="submit"
          className={`${main['button']} ${main['button-danger']}`}
          disabled={busy || !matches || password === ''}
        >
          Delete my account
        </button>
      </div>
    </form>
  );
}
