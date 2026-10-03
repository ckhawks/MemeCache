'use client';

import React, { useState } from 'react';
import globals from '../app/main.module.scss';
import styles from './MemeTranscriptionEditor.module.scss';
import { api } from '@/util/api';

interface TranscriptionData {
  text: string;
  editedBy?: string;
  editedByUsername?: string;
}

// The meme's text, as written on it. Rendered with the page's data, so there is no loading
// state; editing saves a new version and the newest one is shown.
export default function MemeTranscriptionEditor(props: {
  memeId: string;
  userId: string;
  initial: TranscriptionData | null;
}) {
  const [current, setCurrent] = useState<TranscriptionData | null>(props.initial);
  const [draft, setDraft] = useState(props.initial?.text ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const signedIn = props.userId !== '';

  const startEditing = () => {
    setDraft(current?.text ?? '');
    setError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // No editor here on purpose: the server takes the editor from the session.
      const data = await api<{ transcription: TranscriptionData }>(`/api/meme/${props.memeId}/transcription`, {
        body: { text: draft },
      });
      setCurrent(data.transcription);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the transcription.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Transcription</h2>
        {signedIn && !isEditing && current && (
          <button type="button" className={styles.edit} onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className={styles.editor}>
          <textarea
            className={styles['transcription-area']}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            aria-label="Transcription"
            placeholder="Type the text on the meme, top to bottom."
          />
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles['action-buttons']}>
            <button
              type="button"
              className={`${globals.button} ${globals['button-secondary']} ${globals['button-small']}`}
              onClick={() => setIsEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="button" className={`${globals.button} ${globals['button-small']}`} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : current ? (
        <>
          <p className={styles.text}>{current.text}</p>
          {current.editedByUsername && (
            <div className={styles['transcription-author']}>Last edited by {current.editedByUsername}</div>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <span>No transcription yet. Adding the text on the meme is what lets search find it.</span>
          {signedIn && (
            <button
              type="button"
              className={`${globals.button} ${globals['button-secondary']} ${globals['button-small']}`}
              onClick={startEditing}
            >
              Add transcription
            </button>
          )}
        </div>
      )}
    </section>
  );
}
