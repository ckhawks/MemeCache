'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import main from '@/app/main.module.scss';
import f from './AuthForm.module.scss';
import s from './SessionList.module.scss';
import { api } from '@/util/api';
import { describeDevice } from '@/util/describeDevice';
import { timeAgo } from '@/util/datetimeFormat';

export interface SessionItem {
  id: string;
  userAgent: string | null;
  network: string | null;
  // ISO strings: these come from a server component.
  createdAt: string;
  lastSeenAt: string;
}

// "Where you're logged in" (migration 018): each session with its device and when it was
// last used, this browser marked, a Log out button on each, and "Log out everywhere else".
// Logging out this browser goes to the login page; the rest refresh the list.
export default function SessionList(props: {
  sessions: SessionItem[];
  currentId: string;
  // The server's clock when the page rendered, so "5 minutes ago" reads the same on the
  // server and in the browser.
  now: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const now = new Date(props.now).getTime();
  const others = props.sessions.filter((session) => session.id !== props.currentId);

  const run = async (key: string, request: () => Promise<unknown>, after: () => void) => {
    setError('');
    setBusy(key);
    try {
      await request();
      after();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log that session out.');
    } finally {
      setBusy(null);
    }
  };

  const logOut = (id: string) =>
    run(
      id,
      () => api(`/api/user/sessions/${id}`, { method: 'DELETE' }),
      () => (id === props.currentId ? router.push('/login') : router.refresh())
    );

  const logOutOthers = () =>
    run(
      'others',
      () => api('/api/user/sessions', { method: 'DELETE', body: { keep: props.currentId } }),
      () => router.refresh()
    );

  return (
    <div className={s.wrap}>
      <ul className={s.list}>
        {props.sessions.map((session) => (
          <li key={session.id} className={s.item}>
            <div className={s.device}>
              <span className={s.name}>
                {describeDevice(session.userAgent)}
                {session.id === props.currentId && <span className={s.current}>This device</span>}
              </span>
              <span className={s.meta}>
                Last seen {timeAgo(session.lastSeenAt, now)} · logged in{' '}
                {timeAgo(session.createdAt, now)}
                {session.network && <> · network {session.network}</>}
              </span>
            </div>
            <button
              type="button"
              className={`${main['button']} ${main['button-small']} ${main['button-secondary']}`}
              disabled={busy !== null}
              onClick={() => logOut(session.id)}
            >
              Log out
            </button>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className={s.actions}>
          <button
            type="button"
            className={`${main['button']} ${main['button-small']} ${main['button-danger']}`}
            disabled={busy !== null}
            onClick={logOutOthers}
          >
            Log out everywhere else
          </button>
        </div>
      )}
      {error && <span className={f.error}>{error}</span>}
    </div>
  );
}
