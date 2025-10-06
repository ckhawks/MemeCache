'use client';

import React, { useState, useEffect } from 'react';
import globals from '../app/main.module.scss';
import styles from './MemeTagsEditor.module.scss';
import { TagChip } from './TagChip';

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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meme/${memeId}/tags`);
      if (res.ok) {
        const data = await res.json();
        setTagsData(data);
      } else {
        console.error('Failed to load tags');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, [memeId]);

  const handleAddTag = async () => {
    if (!newTag.trim()) return; // do nothing if empty
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/meme/${memeId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send tagName instead of tagId for backend to check/create the tag
        body: JSON.stringify({ tagName: newTag.trim() }),
      });
      if (res.ok) {
        setNewTag('');
        // Refresh the tag list after a successful add.
        fetchTags();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add tag.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to add tag.');
    }
    setLoading(false);
  };

  const handleVote = async (tagId: string, vote: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/meme/${memeId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, vote }),
      });
      if (res.ok) {
        // Refresh tags after vote
        fetchTags();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to record vote.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to record vote.');
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <h6>Tags</h6>
      {loading && <p>Loading...</p>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div className={styles['tags-list']}>
        {tagsData?.tags && tagsData.tags.length > 0 ? (
          tagsData.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} onVote={handleVote} disableVote={tag.own === true} />
          ))
        ) : (
          <i>No tags.</i>
        )}
      </div>
      <div className={styles['tag-actions']} style={{ marginTop: '1rem' }}>
        <input
            id="new-tag-input"
          type="text"
          placeholder="Add a new tag"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          className={styles['tag-input']}
        />
        <button
          className={globals.button}
          onClick={handleAddTag}
          disabled={loading}
        >
          Add Tag
        </button>
      </div>
    </div>
  );
}