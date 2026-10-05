'use client';

import React, { useState } from 'react';
import { Plus } from 'react-feather';
import styles from './MemeTagsEditor.module.scss';
import { TagChip } from './TagChip';
import TagInput from './TagInput';
import { api } from '@/util/api';

interface Tag {
  id: string;
  name: string;
  score: number;
  // The viewer added this tag to this meme.
  own?: boolean;
  // The viewer's vote: 1, -1, or 0.
  myVote?: number;
  // The viewer added it and nobody else has upvoted it yet.
  removable?: boolean;
}

// The meme's tags as chips, ending in a "+ Add tag" chip that opens an inline field.
// Rendered with the page's data; after a vote or an add it reloads the list.
export default function MemeTagsEditor(props: {
  memeId: string;
  userId: string;
  initial: Tag[];
  // No section heading.
  plain?: boolean;
  // Moderators can remove any tag.
  canModerate?: boolean;
}) {
  const [tags, setTags] = useState<Tag[]>(props.initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const signedIn = props.userId !== '';

  const reload = async () => {
    const data = await api<{ tags: Tag[] }>(`/api/meme/${props.memeId}/tags`);
    setTags(data.tags);
  };

  // Returns whether it worked, so the field knows to clear itself for the next tag.
  const handleAddTag = async (name: string) => {
    setError('');
    try {
      // The server finds the tag by name, or creates it.
      await api(`/api/meme/${props.memeId}/tags`, { body: { name } });
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the tag.');
      return false;
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

  const handleRemove = async (tagId: string) => {
    setError('');
    try {
      await api(`/api/meme/${props.memeId}/tags/${tagId}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the tag.');
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
            onRemove={tag.removable || props.canModerate ? handleRemove : undefined}
          />
        ))}
        {signedIn &&
          (adding ? (
            <TagInput
              exclude={tags.map((tag) => tag.name)}
              onAdd={handleAddTag}
              onClose={() => setAdding(false)}
            />
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
