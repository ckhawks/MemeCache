'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../main.module.scss';
import form from '@/components/AuthForm.module.scss';
import r from './Reports.module.scss';
import { api } from '@/util/api';

// Dismiss or Delete meme, with an optional note kept on the resolved reports.
export default function ReportActions(props: { memeId: string }) {
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const resolve = async (action: 'dismiss' | 'delete') => {
    if (action === 'delete' && !window.confirm('Delete this meme? It is hidden everywhere; the file is kept.')) {
      return;
    }
    setProcessing(true);
    setError('');
    try {
      await api(`/api/admin/reports/${props.memeId}`, {
        body: {
          action,
          note: note.trim() || undefined,
        },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve the reports.');
      setProcessing(false);
    }
  };

  return (
    <div className={r.actions}>
      <input
        type="text"
        className={form.input}
        placeholder="Note (optional)"
        aria-label="Note"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className={r.buttons}>
        <button
          type="button"
          className={`${styles.button} ${styles['button-secondary']} ${styles['button-small']}`}
          disabled={processing}
          onClick={() => resolve('dismiss')}
        >
          Dismiss
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles['button-danger']} ${styles['button-small']}`}
          disabled={processing}
          onClick={() => resolve('delete')}
        >
          Delete meme
        </button>
      </div>
      {error && <div className={r.error}>{error}</div>}
    </div>
  );
}
