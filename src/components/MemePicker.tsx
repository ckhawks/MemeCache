'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'react-feather';
import styles from './MemePicker.module.scss';
import { MemeThumb } from './MemeRefCard';
import { api } from '@/util/api';
import type { MemeRef } from '@/db/queries/comments';

// Finds a meme to reply with: type words from it or its tags, or paste a link to it, and
// pick one of the thumbnails. Searches as you type, a moment after you stop. Escape closes.
export default function MemePicker(props: {
  onPick: (meme: MemeRef) => void;
  onClose: () => void;
  // The meme being commented on, left out of the results.
  excludeId?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemeRef[] | null>(null);
  const [error, setError] = useState('');
  const latest = useRef('');

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { memes } = await api<{ memes: MemeRef[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        // A slower answer to an older query must not replace a newer one.
        if (latest.current === q) {
          setResults(memes.filter((m) => m.id !== props.excludeId));
          setError('');
        }
      } catch (err) {
        if (latest.current === q) {
          setError(err instanceof Error ? err.message : 'Search failed.');
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, props.excludeId]);

  const shown = query.trim() ? results : null;

  return (
    <div className={styles['picker']}>
      <div className={styles['field']}>
        <Search size={16} className={styles['icon']} aria-hidden />
        <input
          type="search"
          autoFocus={props.autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              props.onClose();
            }
          }}
          placeholder="Search memes, or paste a link to one"
          aria-label="Find a meme to reply with"
          autoComplete="off"
          maxLength={300}
          className={styles['input']}
        />
      </div>
      {error ? (
        <div className={styles['note']}>{error}</div>
      ) : shown === null ? (
        <div className={styles['note']}>Type words from the meme or its tags.</div>
      ) : shown.length === 0 ? (
        <div className={styles['note']}>No memes found.</div>
      ) : (
        <ul className={styles['results']}>
          {shown.map((meme) => (
            <li key={meme.id}>
              <button
                type="button"
                className={styles['result']}
                onClick={() => props.onPick(meme)}
                aria-label={`Reply with this meme by ${meme.username}`}
                title={`Meme by ${meme.username}`}
              >
                <MemeThumb meme={meme} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
