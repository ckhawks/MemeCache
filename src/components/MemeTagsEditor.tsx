'use client';

import React, { useEffect, useState } from 'react';
import globals from '../app/main.module.scss';
import styles from './MemeTagsEditor.module.scss';
import { TagChip } from './TagChip';
import { api } from '@/util/api';

interface MemeTagsEditorProps {
  memeId: string;
  userId: string;
}

interface Tag {
  id: string;
  name: string;
  score: number;
  own?: boolean; // true if the user added this tag
}

interface TagsData {
  tags: Tag[];
}

export default function MemeTagsEditor({
  memeId,
  userId,
}: MemeTagsEditorProps) {
  const [tagsData, setTagsData] = useState<TagsData | null>(null);
  const [newTag, setNewTag] = useState<string>('');
  // Starts true: the first load begins on mount. Actions set it again themselves.
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Bumped after an add or a vote to load the list again.
  const [reloadKey, setReloadKey] = useState(0);
  const fetchTags = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    api<TagsData>(`/api/meme/${memeId}/tags`)
      .then((data) => {
        if (!cancelled) {
          setTagsData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tags.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [memeId, reloadKey]);

  const handleAddTag = async () => {
    if (!newTag.trim()) return; // do nothing if empty
    setLoading(true);
    setError('');
    try {
      // The server finds the tag by name, or creates it.
      await api(`/api/meme/${memeId}/tags`, { body: { name: newTag.trim() } });
      setNewTag('');
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tag.');
    }
    setLoading(false);
  };

  const handleVote = async (tagId: string, vote: number) => {
    setLoading(true);
    setError('');
    try {
      await api(`/api/meme/${memeId}/tags/${tagId}/vote`, { body: { vote } });
      fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record vote.');
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <h6>Tags</h6>
      {loading && <p>Loading...</p>}
      {error && <div style={{ color: 'var(--danger-color)' }}>{error}</div>}
      <div className={styles['tags-list']}>
        {tagsData?.tags && tagsData.tags.length > 0 ? (
          tagsData.tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onVote={handleVote}
              // No voting on your own tags, and none while logged out.
              disableVote={tag.own || !userId}
            />
          ))
        ) : (
          <i>No tags.</i>
        )}
      </div>
      { (userId !== '' && userId != null ) && (
        // A form, so Enter in the field adds the tag.
        <form
          className={styles['tag-actions']}
          style={{ marginTop: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            handleAddTag();
          }}
        >
          <input
            id="new-tag-input"
            type="text"
            placeholder="Add a new tag"
            aria-label="New tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className={styles['tag-input']}
          />
          <button type="submit" className={globals.button} disabled={loading}>
            Add tag
          </button>
        </form>
      )}

    </div>
  );
}