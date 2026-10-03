'use client';

import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';
import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import Link from 'next/link';
import styles from '../main.module.scss';
import imageCompression from 'browser-image-compression';
import { api } from '@/util/api';

export default function UploadComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [submitEnabled, setSubmitEnabled] = useState(false);
  const [message, setMessage] = useState('');
  // The meme just uploaded, so the success message can link to it.
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      setMediaType('image');
    } else if (file.type.startsWith('video/')) {
      setMediaType('video');
    } else {
      setMediaType(null);
      setPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setFile(file);
    setSubmitEnabled([...supportedImageTypes, ...supportedVideoTypes].includes(file.type));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      selectFile(file);
    }
  };

  // Shared from another app on Android: public/sw.js parked the file in Cache Storage and
  // sent us here with ?shared=1. Take it out once and preselect it.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('shared') || !('caches' in window)) {
      return;
    }
    (async () => {
      const cache = await caches.open('share-target');
      const response = await cache.match('/shared-file');
      if (!response) {
        return;
      }
      await cache.delete('/shared-file');
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') ?? 'shared');
      selectFile(new File([blob], name, { type: blob.type }));
      setMessage('Shared file ready. Check the preview, then upload.');
    })().catch((error) => console.error('Could not read the shared file:', error));
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file to upload.');
      return;
    }

    let fileToUpload = file;

    // For images, always attempt to compress losslessly and downscale if over 1920
    if (mediaType === 'image') {
      try {
        // If GIF, skip compression/conversion to preserve animation
        if (file.type === 'image/gif') {
          console.log(
            'GIF detected; skipping compression to preserve animation.'
          );
          // enforce 4MB limit for GIFs
          if (file.size > 4 * 1024 * 1024) {
            setMessage(
              'GIF file is too large. Please select a GIF smaller than 4MB.'
            );
            return;
          }
        } else {
          const options = {
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            initialQuality: 1, // maintain original quality
          };
          console.log('Uncompressed file size: ', fileToUpload.size);
          fileToUpload = await imageCompression(file, options);
          console.log('Compressed file size: ', fileToUpload.size);
          if (fileToUpload.size > 4 * 1024 * 1024) {
            // Check if compressed file exceeds 4MB
            setMessage(
              'Compressed image file is still larger than 4MB. Please choose a smaller image.'
            );
            return;
          }
        }
      } catch (error) {
        console.error('Image compression error: ', error);
      }
    } else if (mediaType === 'video') {
      // Limit video file size to 30MB for now
      const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30 MB
      if (file.size > MAX_VIDEO_SIZE) {
        setMessage(
          'Video file is too large. Please select a video less than 30 MB.'
        );
        return;
      }
    }

    const formData = new FormData();
    // No userId here on purpose -- the server takes the uploader from the session.
    formData.append('file', fileToUpload);

    try {
      const result = await api<{ id: string }>('/api/upload', { body: formData });
      setUploadedId(result.id);
      setMessage('Uploaded.');
      setFile(null);
      setSubmitEnabled(false);
      setPreview(null);
      setMediaType(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload file.');
    }
  };

  return (
    <div>
      {/* Stacked rather than two columns, which squeezed the file input to "No" on phones. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
        <Form.Control
          type="file"
          aria-label="Meme file"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setUploadedId(null);
            handleFileChange(event);
          }}
          ref={inputRef}
        />
        <div>
          <button
            type="button"
            className={styles['button']}
            onClick={handleUpload}
            disabled={!submitEnabled}
          >
            Upload
          </button>
        </div>
        {message && (
          <p style={{ margin: 0 }}>
            {message}{' '}
            {uploadedId && <Link href={`/meme/${uploadedId}`}>View it</Link>}
          </p>
        )}
      </div>
      {preview && mediaType === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Preview of the selected file"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      )}
      {preview && mediaType === 'video' && (
        <video src={preview} controls style={{ maxWidth: '100%' }} />
      )}
      {!preview && (
        <div style={{ marginTop: '10px', fontStyle: 'italic', color: 'var(--sub-text-color)' }}>
          No file selected
        </div>
      )}
    </div>
  );
}
