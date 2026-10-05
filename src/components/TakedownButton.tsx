'use client';

import { useState } from 'react';
import { Slash } from 'react-feather';
import { Button, Modal } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import f from './AuthForm.module.scss';
import { api } from '@/util/api';
import {
  TAKEDOWN_REASON_LABELS,
  TAKEDOWN_REASONS,
  type TakedownReason,
} from '@/constants/takedowns';

// Admins only: take a meme down for a copyright claim or similar (migration 018). Unlike
// Delete, this deletes the file from storage for good and leaves a notice on the meme's
// page saying why. The note is for admins and is never shown.
export default function TakedownButton(props: { memeId: string }) {
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState<TakedownReason>('copyright');
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const close = () => {
    setShow(false);
    setError('');
  };

  const takeDown = async () => {
    setProcessing(true);
    setError('');
    try {
      await api(`/api/meme/${props.memeId}/takedown`, {
        body: { reason, note: note.trim() || null },
      });
      setShow(false);
      // The page now shows the notice in place of the meme.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not take the meme down.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShow(true)}
        className={`${localStyles['pill']} ${localStyles['pillDanger']}`}
      >
        <Slash size={16} />
        Take down
      </button>
      <Modal show={show} onHide={close} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontWeight: 700 }}>Take down meme</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className={f.form}>
            <p style={{ margin: 0 }}>
              The file is deleted from storage and cannot be brought back. The meme&apos;s page will say it was removed and why.
            </p>
            <div className={f.field}>
              <label htmlFor="takedown-reason" className={f.label}>
                Reason
              </label>
              <select
                id="takedown-reason"
                className={f.select}
                value={reason}
                onChange={(e) => setReason(e.target.value as TakedownReason)}
              >
                {TAKEDOWN_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {TAKEDOWN_REASON_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className={f.field}>
              <label htmlFor="takedown-note" className={f.label}>
                Note for admins
              </label>
              <textarea
                id="takedown-note"
                className={f.input}
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Who made the claim, a reference number"
              />
              <span className={f.hint}>Only admins can see this.</span>
            </div>
            {error && <span className={f.error}>{error}</span>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={close}
            className={`${styles['button']} ${styles['button-secondary']}`}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={takeDown}
            className={`${styles['button']} ${styles['button-danger']}`}
            disabled={processing}
          >
            Take down
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
