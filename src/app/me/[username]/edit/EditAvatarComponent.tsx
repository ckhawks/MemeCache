'use client';

import { supportedImageTypes } from '@/constants/mimeTypes';
import React, { useState } from 'react';
import { Col, Form, Row } from 'react-bootstrap';

import styles from '../../../main.module.scss';
import { api } from '@/util/api';

export default function EditAvatarComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<string>('');
  const [submitEnabled, setSubmitEnabled] = useState(false);
  const [message, setMessage] = useState('');

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 1MB in bytes

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
      setContentType(selectedFile.type);
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

        const width = 128;
        const height = 128;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

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
      setFile(null);
      setContentType('');
      setSubmitEnabled(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload avatar.');
    }
  };

  return (
    <div>
      <Form>
        <Row>
          <Col>
            <Form.Control type="file" onChange={handleFileChange} />
            <span>{contentType}</span>
          </Col>
          <Col>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!submitEnabled}
              className={`${styles['button']}`}
            >
              Upload
            </button>
          </Col>
        </Row>
        {message && <p>{message}</p>}
      </Form>
    </div>
  );
}
