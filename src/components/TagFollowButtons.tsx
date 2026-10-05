'use client';

import { useState } from 'react';
import { Check, Eye, EyeOff, Plus } from 'react-feather';
import main from '../app/main.module.scss';
import styles from './TagFollowButtons.module.scss';
import { api } from '@/util/api';
import type { TagPreference } from '@/db/queries/tagPreferences';

// Follow and Mute for one tag (migration 016), on the tag page and the browse rows. The two
// exclude each other: a muted tag shows only Unmute, and muting a followed tag unfollows it.
// Only shown to signed-in members. `note` adds a line saying what the current state does.
export default function TagFollowButtons(props: {
  tagId: string;
  tagName: string;
  preference: TagPreference | null;
  note?: boolean;
}) {
  const [preference, setPreference] = useState(props.preference);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const change = async (next: TagPreference | null) => {
    if (pending) {
      return;
    }
    // Optimistic, rolled back on failure.
    const previous = preference;
    setPreference(next);
    setPending(true);
    setError('');
    try {
      await api(`/api/tags/${props.tagId}/preference`, { body: { preference: next } });
    } catch (e) {
      setPreference(previous);
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setPending(false);
    }
  };

  const small = `${main.button} ${main['button-small']}`;
  const secondary = `${small} ${main['button-secondary']}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        {preference === 'mute' ? (
          <button
            type="button"
            className={secondary}
            onClick={() => change(null)}
            aria-label={`Unmute ${props.tagName}`}
          >
            <Eye size={14} /> Unmute
          </button>
        ) : (
          <>
            {preference === 'follow' ? (
              <button
                type="button"
                className={`${small} ${main['button-success']}`}
                onClick={() => change(null)}
                aria-label={`Unfollow ${props.tagName}`}
                aria-pressed="true"
              >
                <Check size={14} /> Following
              </button>
            ) : (
              <button
                type="button"
                className={small}
                onClick={() => change('follow')}
                aria-label={`Follow ${props.tagName}`}
                aria-pressed="false"
              >
                <Plus size={14} /> Follow
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => change('mute')}
              aria-label={`Mute ${props.tagName}`}
            >
              <EyeOff size={14} /> Mute
            </button>
          </>
        )}
      </div>
      {props.note && preference === 'mute' && (
        <p className={styles.note}>Muted. Memes with this tag are hidden from your feeds, search and the queue.</p>
      )}
      {props.note && preference === 'follow' && (
        <p className={styles.note}>Following. Memes with this tag come first in For you on Explore.</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
