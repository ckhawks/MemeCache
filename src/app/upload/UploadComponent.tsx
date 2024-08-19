'use client';

import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';
import React, { useEffect, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';

export default function UploadComponent(props: {
  userId: string;
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', props.userId);
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
            <Form.Control type="file" onChange={handleFileChange} />
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
    </div>
  );
}
