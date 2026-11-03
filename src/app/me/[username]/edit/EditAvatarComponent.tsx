'use client';

import { MAX_AVATAR_BYTES, supportedImageTypes } from '@/constants/mimeTypes';
import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import { useRouter } from 'next/navigation';

import styles from '../../../main.module.scss';
import { api } from '@/util/api';

// Sends the picture as chosen. The server cuts it to a square and shrinks it, keeping an
// animated GIF or WebP animated; doing that here on a canvas kept only the first frame.
export default function EditAvatarComponent() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(null);
    setMessage('');
    if (!selectedFile) {
      return;
    }
    if (!supportedImageTypes.includes(selectedFile.type)) {
      setMessage('That file type is not supported. Use a PNG, JPEG, GIF or WebP.');
      return;
    }
    if (selectedFile.size > MAX_AVATAR_BYTES) {
      setMessage('That picture is too large for an avatar. The limit is 8 MB.');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file to upload.');
      return;
    }

    setUploading(true);
    try {
      // No user id here on purpose -- the server takes the owner from the session.
      const formData = new FormData();
      formData.append('file', file);

      await api('/api/user/avatar', { body: formData });
      setMessage('Avatar changed.');
      // Re-render the page so the preview (and the nav avatar) pick up the new image.
      router.refresh();
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Form.Control type="file" accept={supportedImageTypes.join(',')} aria-label="Avatar image" onChange={handleFileChange} />
        <div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`${styles['button']}`}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {message && <p style={{ margin: 0 }}>{message}</p>}
      </div>
    </div>
  );
}
