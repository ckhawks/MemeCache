'use client';

import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import imageCompression from 'browser-image-compression';

export default function UploadComponent(props: {
  caches: {
    id: string;
    name: string;
  }[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<string>('');
  const [submitEnabled, setSubmitEnabled] = useState(false);
  const [cacheId, setCacheId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      // Determine media type based on file type
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
    }

    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setContentType(event.target.files[0].type);
      setSubmitEnabled(
        [...supportedImageTypes, ...supportedVideoTypes].indexOf(
          event.target.files[0].type
        ) > -1
      );
      console.log();
    }
  };

  const handleCacheChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCacheId(event.target.value);
  };

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
    formData.append('cacheId', cacheId);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message);
        setFile(null);
        setContentType('');
        setSubmitEnabled(false);
        setPreview(null);
        setMediaType(null);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      } else {
        setMessage(result.error || 'Something went wrong');
      }
    } catch (error) {
      setMessage('Failed to upload file');
    }
  };

  useEffect(() => {
    setCacheId(props.caches[0].id);
  }, [props.caches]);

  console.log('cacheId', cacheId);

  return (
    <div>
      <Form>
        {/* <h1>Upload a file</h1> */}
        <Row>
          <Col>
            <Form.Control
              type="file"
              onChange={handleFileChange}
              ref={inputRef}
            />
            <span>{contentType}</span>
          </Col>
          {/* <input
            style={{ display: 'none' }}
            type="hidden"
            id="userId"
            name="userId"
            value={props.userId}
          ></input> */}
          <Col>
            <Form.Select
              aria-label="Cache"
              name="cache"
              id="cache"
              onChange={handleCacheChange}
            >
              {props.caches &&
                props.caches.map((cache) => (
                  <option value={cache?.id} key={cache?.id}>
                    {cache?.name}
                  </option>
                ))}
            </Form.Select>
          </Col>
          <Col>
            <Button onClick={handleUpload} disabled={!submitEnabled}>
              Upload
            </Button>
          </Col>
        </Row>
        {message && <p>{message}</p>}
      </Form>
      {preview && mediaType === 'image' && (
        <img
          src={preview}
          alt="Image Preview"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      )}
      {preview && mediaType === 'video' && (
        <video src={preview} controls style={{ maxWidth: '100%' }} />
      )}
      {!preview && (
        <div style={{ marginTop: '10px', fontStyle: 'italic' }}>
          No file selected
        </div>
      )}
    </div>
  );
}
