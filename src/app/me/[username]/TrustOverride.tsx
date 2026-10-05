'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import p from './Profile.module.scss';
import { api } from '@/util/api';

type Override = 'trusted' | 'held' | null;

// Admins only: pin a user's hold either way, or leave it to their record.
export default function TrustOverride(props: { userId: string; override: Override }) {
  const router = useRouter();
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
    <div className={p.trustOverride}>
      <label htmlFor="trust-override">Contributions:</label>
      <select
        id="trust-override"
        value={value ?? 'auto'}
        onChange={(e) => change(e.target.value === 'auto' ? null : (e.target.value as Override))}
      >
        <option value="auto">Automatic, from their record</option>
        <option value="trusted">Always count</option>
        <option value="held">Hold for review</option>
      </select>
      {error && <span>{error}</span>}
    </div>
  );
}
