'use client';

import { supportedImageTypes } from '@/constants/mimeTypes';
import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import { useRouter } from 'next/navigation';

import styles from '../../../main.module.scss';
import { api } from '@/util/api';

export default function EditAvatarComponent() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitEnabled, setSubmitEnabled] = useState(false);
  const [message, setMessage] = useState('');

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];

      // if (selectedFile.size > MAX_FILE_SIZE) {
      //   setMessage(`File size exceeds the maximum limit of 2MB.`);
      //   setSubmitEnabled(false);
      //   return;
      // }

      if (!(supportedImageTypes.indexOf(selectedFile.type) > -1)) {
        setMessage('That file type is not supported.');
        setSubmitEnabled(false);
        return;
      }

      setFile(selectedFile);
      setSubmitEnabled(supportedImageTypes.indexOf(selectedFile.type) > -1);
    }
  };

  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Center-crop to a square, then scale to 128x128. This used to stretch any
        // image to 128x128, squashing non-square photos.
        const size = 128;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        canvas.width = size;
        canvas.height = size;

        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to resize image'));
          }
        }, file.type);
      };

      img.onerror = (error) => {
        reject(error);
      };
    });
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file to upload.');
      return;
    }

    try {
      const resizedBlob = await resizeImage(file);
      const resizedFile = new File([resizedBlob], file.name, {
        type: file.type,
      });

      // Optional: Check the size of the resized file
      if (resizedFile.size > MAX_FILE_SIZE) {
        setMessage('Resized image exceeds the maximum file size limit of 2MB.');
        return;
      }

      // No user id here on purpose -- the server takes the owner from the session.
      const formData = new FormData();
      formData.append('file', resizedFile);

      await api('/api/user/avatar', { body: formData });
      setMessage('Avatar changed.');
      // Re-render the page so the preview (and the nav avatar) pick up the new image.
      router.refresh();
      setFile(null);
      setSubmitEnabled(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload avatar.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Form.Control type="file" aria-label="Avatar image" onChange={handleFileChange} />
        <div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!submitEnabled}
            className={`${styles['button']}`}
          >
            Upload
          </button>
        </div>
        {message && <p style={{ margin: 0 }}>{message}</p>}
      </div>
    </div>
  );
}
