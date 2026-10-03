'use client';

import React, { useState, useEffect } from 'react';
import globals from '../app/main.module.scss';
import styles from './MemeTranscriptionEditor.module.scss';
import { api } from '@/util/api';

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
      setLoading(true);
      try {
        const data = await api<{ transcription: TranscriptionData | null }>(
          `/api/meme/${memeId}/transcription`
        );
        setTranscriptionData(data.transcription);
        setTranscription(data.transcription?.text || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transcription.');
      } finally {
        setLoading(false);
      }
    }

    fetchTranscription();
    // setLoading(false);
  }, [memeId]);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      // No editor here on purpose -- the server takes the editor from the session.
      const data = await api<{ transcription: TranscriptionData }>(
        `/api/meme/${memeId}/transcription`,
        { body: { text: transcription } }
      );
      setIsEditing(false);
      setTranscriptionData(data.transcription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transcription.');
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <h6>Transcription</h6>
      {!isEditing ? (
        <div>
          <div className={styles['transcription-text']}>
            {loading && <p>Loading...</p>}
            {!loading && (
              <>
                <p>
                  {transcriptionData?.text || (
                    <i>No transcription submitted.</i>
                  )}
                </p>
                { transcriptionData?.editedByUsername && <div className={styles['transcription-author']}>
                  Last updated by{' '}
                  <span style={{ color: 'black', fontWeight: '500' }}>
                    {transcriptionData?.editedByUsername}
                  </span>
                </div>}
              </>
            )}
          </div>

          { (userId !== '' && userId !== null ) && <div className={styles['action-buttons']}>
            <button
              className={globals.button}
              onClick={() => setIsEditing(true)}
              disabled={loading}
            >
              Edit
            </button>
          </div>}
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
