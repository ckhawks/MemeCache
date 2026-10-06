'use client';

import { useState } from 'react';
import Link from 'next/link';
import main from '../app/main.module.scss';
import styles from './YourTags.module.scss';
import { api } from '@/util/api';
import type { PreferredTag } from '@/db/queries/tagPreferences';

// The tags you follow and the ones you muted, each with a button to undo it. On the edit
// profile page. Removing is optimistic; a failed request puts the tag back with the error.
export default function YourTags(props: { tags: PreferredTag[] }) {
  const [tags, setTags] = useState(props.tags);
  const [error, setError] = useState('');

  const remove = async (tag: PreferredTag) => {
    setError('');
    setTags((current) => current.filter((t) => t.id !== tag.id));
    try {
      await api(`/api/tags/${tag.id}/preference`, { body: { preference: null } });
    } catch (e) {
      setTags((current) => [...current, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  };

  const list = (kind: PreferredTag['kind'], title: string, empty: React.ReactNode, undo: string) => {
    const these = tags.filter((t) => t.kind === kind);
    return (
      <div className={styles.group}>
        <h6 className={styles.title}>{title}</h6>
        {these.length === 0 ? (
          <p className={styles.empty}>{empty}</p>
        ) : (
          <ul className={styles.list}>
            {these.map((tag) => (
              <li key={tag.id} className={styles.item}>
                <Link href={`/t/${encodeURIComponent(tag.name)}`} className={styles.name}>
                  #{tag.name}
                </Link>
                <button
                  type="button"
                  className={`${main.button} ${main['button-secondary']} ${main['button-small']}`}
                  onClick={() => remove(tag)}
                  aria-label={`${undo} ${tag.name}`}
                >
                  {undo}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className={styles.wrap}>
      {list(
        'follow',
        'Following',
        <>
          None yet. Follow tags on <Link href="/tags">Browse tags</Link> or on a tag&apos;s page, and their memes come first in For you on Explore, alongside uploads from people you follow.
        </>,
        'Unfollow'
      )}
      {list('mute', 'Muted', 'None. Memes with a muted tag are hidden from your feeds, search and the queue.', 'Unmute')}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
