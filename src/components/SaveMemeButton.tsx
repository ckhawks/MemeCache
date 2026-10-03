'use client';

import { useState } from 'react';
import { Bookmark } from 'react-feather';
import styles from './LikeButton.module.scss';
import Tooltip from './Tooltip';
import { api } from '@/util/api';

// Saves a meme to your Library. Private, unlike a like, so there is no count. Only shown
// to signed-in users.
export default function SaveMemeButton(props: { memeId: string; saved: boolean; labeled?: boolean }) {
  const [saved, setSaved] = useState(props.saved);
  const [pending, setPending] = useState(false);

  const onToggle = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pending) {
      return;
    }

    // Optimistic, rolled back on failure.
    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      await api(`/api/meme/${props.memeId}/save`, { body: { saved: next } });
    } catch (error) {
      setSaved(!next);
      console.error('Failed to change save:', error);
    } finally {
      setPending(false);
    }
  };

  const label = saved ? 'Remove from Library' : 'Save to Library';

  if (props.labeled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${styles['pill']} ${saved ? styles['pillActive'] : ''}`}
        aria-label={label}
      >
        <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
        {saved ? 'Saved' : 'Save'}
      </button>
    );
  }

  return (
    <Tooltip label={label}>
      <button type="button" onClick={onToggle} className={styles['wrapper']} aria-label={label}>
        <Bookmark
          size={14}
          className={`${styles['icon']} ${saved ? styles['saved'] : ''}`}
          fill={saved ? 'currentColor' : 'none'}
        />
      </button>
    </Tooltip>
  );
}
