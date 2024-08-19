'use client';

import { supportedImageTypes } from '@/constants/mimeTypes';
import React, { useEffect, useState } from 'react';
import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';

import styles from '../../../main.module.scss';

export default function EditUsernameComponent(props: {
  userId: string;
  username: string;
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
        supportedImageTypes.indexOf(event.target.files[0].type) > -1
      );
      console.log();
    }
  };

  const handleCacheChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCacheId(event.target.value);
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('userId', props.userId);

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

  return (
    <div>
      <Form>
        {/* <h1>Upload a file</h1> */}
        <Row>
          <Col>
            <InputGroup>
              <InputGroup.Text id="basic-addon1">.me/me/</InputGroup.Text>
              <Form.Control
                placeholder="Username"
                aria-label="Username"
                aria-describedby="basic-addon1"
                // style={{ maxWidth: '400px' }}
                defaultValue={props.username}
              />
            </InputGroup>
          </Col>
          {/* <input
            style={{ display: 'none' }}
            type="hidden"
            id="userId"
            name="userId"
            value={props.userId}
          ></input> */}
          <Col>
            <button
              onClick={handleUpload}
              disabled={!submitEnabled}
              className={`${styles['button']}`}
              disabled
            >
              Update
            </button>
          </Col>
        </Row>
        {message && <p>{message}</p>}
      </Form>
    </div>
  );
}
