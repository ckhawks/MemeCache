'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import f from './AuthForm.module.scss';
import { api } from '@/util/api';

type Override = 'trusted' | 'held' | null;

// Admins only: pin a user's hold either way, or leave it to their record. Saves on change.
export default function TrustOverride(props: { userId: string; override: Override }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState<Override>(props.override);
  const [error, setError] = useState('');

  const change = async (next: Override) => {
    setError('');
    try {
      await api('/api/admin/trust', { body: { userId: props.userId, override: next } });
      setValue(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change it.');
    }
  };

  return (
    <div className={f.field}>
      <label htmlFor={id} className={f.label}>
        Contributions
      </label>
      <select
        id={id}
        className={f.select}
        value={value ?? 'auto'}
        onChange={(e) => change(e.target.value === 'auto' ? null : (e.target.value as Override))}
      >
        <option value="auto">Automatic, from their record</option>
        <option value="trusted">Always count</option>
        <option value="held">Hold for review</option>
      </select>
      {error && <span className={f.error}>{error}</span>}
    </div>
  );
}
