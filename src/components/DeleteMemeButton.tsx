import { Trash } from 'react-feather';
import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/util/api';

export default function DeleteMemeButton(props: { memeId: string }) {
  const [show, setShow] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const pathname = usePathname();

  const handleClose = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setShow(false);
    setError('');
  };
  const handleShow = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    setShow(true);
  };

  const handleDeleteMeme = async (event: React.SyntheticEvent) => {
    event.stopPropagation();
    setProcessing(true);
    setError('');

    try {
      await api(`/api/meme/${props.memeId}`, { method: 'DELETE' });
      setShow(false);
      // The meme's own page would 404 now. Anywhere else, re-render without it.
      if (pathname.startsWith('/meme/')) {
        router.push('/library');
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meme.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div onClick={handleShow} className={localStyles['wrapper']}>
        <Trash size={14} className={`${localStyles['icon']}`} />
      </div>
      <Modal show={show} onHide={handleClose} centered>
        <div onClick={(e) => e.stopPropagation()}>
          <Modal.Header closeButton>
            <Modal.Title style={{ fontWeight: 700 }}>Delete meme</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div>Are you sure you want to delete this meme?</div>
            {error && <div style={{ color: 'red', marginTop: '0.5rem' }}>{error}</div>}
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
              onClick={handleDeleteMeme}
              className={`${styles['button']} ${styles['button-danger']}`}
              disabled={processing}
            >
              Delete
            </Button>
          </Modal.Footer>
        </div>
      </Modal>
    </>
  );
}
