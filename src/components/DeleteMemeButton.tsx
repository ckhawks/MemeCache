import { Heart, Trash } from 'react-feather';

import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Modal } from 'react-bootstrap';

export default function DeleteMemeButton(props: {
  memeId: string;
  userId: string;
}) {
  const [show, setShow] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const handleDeleteMeme = async () => {
    setProcessing(true);
    const formData = new FormData();
    formData.append('memeId', props.memeId);
    formData.append('userId', props.userId);
    // formData.append('cacheId', cacheId);

    try {
      const response = await fetch('/api/meme/delete', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setProcessing(false);
        setShow(false);
        // console.log()
        // setMessage(result.message);
      } else {
        console.log('Failed to delete meme');
        setProcessing(false);
        setShow(false);
        // setMessage(result.error || 'Something went wrong');
      }
    } catch (error) {
      console.log('failed to change like status, ' + error);
      setProcessing(false);
      setShow(false);
      // setMessage('Failed to upload file');
    }
  };

  return (
    <>
      <div onClick={handleShow} className={localStyles['wrapper']}>
        <Trash size={14} className={`${localStyles['icon']}`} />
      </div>
      <Modal show={show} onHide={handleClose} centered>
        <Form action={handleDeleteMeme}>
          <Modal.Header closeButton>
            <Modal.Title style={{ fontWeight: 700 }}>Delete meme</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {/* {state?.message && (
              <p aria-live="polite">
                <Alert variant="danger" style={{ fontSize: '0.9rem' }}>
                  {state?.message}
                </Alert>
              </p>
            )} */}
            <div>
              Are you sure you want to delete this meme?
              <br /> <br />
              <i>This cannot be undone.</i>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={handleClose}
              className={`${styles['button']} ${styles['button-secondary']}`}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="submit"
              onClick={handleDeleteMeme}
              className={`${styles['button']} ${styles['button-danger']}`}
              disabled={processing}
            >
              Delete
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
