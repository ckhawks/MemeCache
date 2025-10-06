'use client';

import React, { useState, useEffect } from 'react';
import globals from '../app/main.module.scss';
import styles from './MemeTranscriptionEditor.module.scss';

interface MemeTranscriptionEditorProps {
  memeId: string;
  userId: string;
}

interface TranscriptionData {
  text: string;
  editedBy?: string;
  editedByUsername?: string;
}

export default function MemeTranscriptionEditor({
  memeId,
  userId,
}: MemeTranscriptionEditorProps) {
  const [transcriptionData, setTranscriptionData] =
    useState<TranscriptionData | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function fetchTranscription() {
      try {
        const res = await fetch(`/api/meme/${memeId}/transcription`);
        if (res.ok) {
          const data = await res.json();
          setTranscriptionData(data || {});
          setTranscription(data.text || '');
        } else {
          console.error('Failed to load transcription');
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchTranscription();
  }, [memeId]);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/meme/${memeId}/transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcription, edited_by: userId }),
      });
      if (res.ok) {
        setIsEditing(false);
        const data = await res.json();
        setTranscriptionData(data.transcription || {});
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save transcription.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save transcription.');
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <h6>Transcription</h6>
      {!isEditing ? (
        <div>
          <div className={styles['transcription-text']}>
            <p>
              {transcriptionData?.text || <i>No transcription submitted.</i>}
            </p>
            <div className={styles['transcription-author']}>
              Last updated by{' '}
              <span style={{ color: 'black', fontWeight: '500' }}>
                {transcriptionData?.editedByUsername}
              </span>
            </div>
          </div>

          <div className={styles['action-buttons']}>
            <button
              className={globals.button}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          </div>
        </div>
      ) : (
        <div>
          <textarea
            className={styles['transcription-area']}
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            rows={4}
          />
          <div className={styles['action-buttons']}>
            <button
              className={globals.button}
              onClick={handleSave}
              disabled={loading}
            >
              Save
            </button>
            <button
              className={`${globals.button} ${globals['button-secondary']}`}
              onClick={() => setIsEditing(false)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div style={{ color: 'red', marginTop: '0.5rem' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
