'use client';

import React, { useState } from 'react';
import { Plus } from 'react-feather';
import styles from './MemeTagsEditor.module.scss';
import { TagChip } from './TagChip';
import { api } from '@/util/api';

interface Tag {
  id: string;
  name: string;
  score: number;
  // The viewer added this tag to this meme.
  own?: boolean;
  // The viewer's vote: 1, -1, or 0.
  myVote?: number;
}

// The meme's tags as chips, ending in a "+ Add tag" chip that opens an inline field.
// Rendered with the page's data; after a vote or an add it reloads the list.
export default function MemeTagsEditor(props: {
  memeId: string;
  userId: string;
  initial: Tag[];
  // No section heading.
  plain?: boolean;
}) {
  const [tags, setTags] = useState<Tag[]>(props.initial);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = props.userId !== '';

  const reload = async () => {
    const data = await api<{ tags: Tag[] }>(`/api/meme/${props.memeId}/tags`);
    setTags(data.tags);
  };

  const handleAddTag = async () => {
    const name = newTag.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The server finds the tag by name, or creates it.
      await api(`/api/meme/${props.memeId}/tags`, { body: { name } });
      setNewTag('');
      setAdding(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the tag.');
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (tagId: string, vote: number) => {
    setError('');
    try {
      await api(`/api/meme/${props.memeId}/tags/${tagId}/vote`, { body: { vote } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the vote.');
    }
  };

  return (
    <section className={styles.section}>
      {!props.plain && <h2 className={styles.title}>Tags</h2>}
      <div className={styles['tags-list']}>
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onVote={handleVote}
            // No voting on your own tags, and none while logged out.
            disableVote={tag.own || !signedIn}
            voteHint={!signedIn ? 'Log in to vote' : tag.own ? 'You added this tag' : undefined}
          />
        ))}
        {signedIn &&
          (adding ? (
            // A form, so Enter adds the tag; Escape or leaving it empty closes it.
            <form
              className={styles['add-form']}
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTag();
              }}
            >
              <input
                type="text"
                placeholder="New tag"
                aria-label="New tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewTag('');
                  }
                }}
                onBlur={() => !newTag.trim() && setAdding(false)}
                className={styles['tag-input']}
                maxLength={50}
                autoFocus
                disabled={busy}
              />
            </form>
          ) : (
            <button type="button" className={styles['add-chip']} onClick={() => setAdding(true)}>
              <Plus size={12} /> Add tag
            </button>
          ))}
      </div>
      {tags.length === 0 && !adding && (
        <div className={styles.empty}>
          No tags yet.{signedIn ? ' Tags are how memes get found; add the first one.' : ''}
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </section>
  );
}
