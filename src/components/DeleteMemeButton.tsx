import { Trash } from 'react-feather';
import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/util/api';
import Tooltip from './Tooltip';
import form from './AuthForm.module.scss';

export default function DeleteMemeButton(props: {
  memeId: string;
  // Deleting someone else's meme as a moderator. Changes the label and asks for a reason.
  asModerator?: boolean;
  labeled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  // A moderator says why, for the moderation log. Optional.
  const [reason, setReason] = useState('');
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
      await api(`/api/meme/${props.memeId}`, {
        method: 'DELETE',
        body: props.asModerator ? { reason: reason.trim() || undefined } : undefined,
      });
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
      {props.labeled ? (
        <button
          type="button"
          onClick={handleShow}
          className={`${localStyles['pill']} ${localStyles['pillDanger']}`}
          aria-label={props.asModerator ? 'Delete as moderator' : 'Delete'}
        >
          <Trash size={16} />
          {props.asModerator ? 'Delete (mod)' : 'Delete'}
        </button>
      ) : (
        <Tooltip label={props.asModerator ? 'Delete as moderator' : 'Delete'}>
          <button
            type="button"
            onClick={handleShow}
            className={localStyles['wrapper']}
            aria-label={props.asModerator ? 'Delete as moderator' : 'Delete'}
          >
            <Trash size={14} className={`${localStyles['icon']}`} />
          </button>
        </Tooltip>
      )}
      <Modal show={show} onHide={handleClose} centered>
        <div onClick={(e) => e.stopPropagation()}>
          <Modal.Header closeButton>
            <Modal.Title style={{ fontWeight: 700 }}>Delete meme</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div>Are you sure you want to delete this meme?</div>
            {props.asModerator && (
              <div className={form.field} style={{ marginTop: '0.75rem' }}>
                <label htmlFor={`delete-reason-${props.memeId}`} className={form.label}>
                  Reason (optional)
                </label>
                <textarea
                  id={`delete-reason-${props.memeId}`}
                  className={form.input}
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Kept in the moderation log"
                />
              </div>
            )}
            {error && <div style={{ color: 'var(--danger-color)', marginTop: '0.5rem' }}>{error}</div>}
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
