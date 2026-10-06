'use client';

import { useState } from 'react';
import { GitMerge } from 'react-feather';
import { Button, Modal } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import f from './AuthForm.module.scss';
import m from './MergeMemeButton.module.scss';
import { api } from '@/util/api';
import type { ThumbMeme } from './MemeThumbStrip';

// Moderators: merge this meme into the one it duplicates (migration 021). Everything on
// this one (likes, saves, comments, tags, views) moves to the original, this one is deleted,
// and its page redirects there. The original is picked from the memes the fingerprints
// matched, or pasted as a link or slug.
export default function MergeMemeButton(props: { memeId: string; candidates: ThumbMeme[] }) {
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const into = link.trim() || picked;

  const close = () => {
    setShow(false);
    setError('');
  };

  const merge = async () => {
    if (!into) {
      setError('Pick the original, or paste its link.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const result = await api<{ slug: string }>(`/api/meme/${props.memeId}/merge`, { body: { into } });
      setShow(false);
      router.push(`/meme/${result.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge the memes.');
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
        <GitMerge size={16} />
        Merge into…
      </button>
      <Modal show={show} onHide={close} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontWeight: 700 }}>Merge into the original</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className={f.form}>
            <p style={{ margin: 0 }}>
              This meme is a copy of another one. Its likes, saves, comments, tags and views move to the original, this one is deleted, and its link takes people to the original from now on. It cannot be undone from here.
            </p>
            {props.candidates.length > 0 && (
              <div className={f.field}>
                <span className={f.label}>Memes that look like this one</span>
                <div className={m.picker} role="radiogroup" aria-label="The original">
                  {props.candidates.map((meme) => (
                    <button
                      key={meme.id}
                      type="button"
                      role="radio"
                      aria-checked={picked === meme.slug}
                      className={`${m.option} ${picked === meme.slug ? m.selected : ''}`}
                      onClick={() => {
                        setPicked(meme.slug);
                        setLink('');
                      }}
                    >
                      {meme.contentType.startsWith('video/') ? (
                        <video src={`/api/resource/${meme.id}#t=1`} preload="metadata" muted playsInline className={m.media} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/resource/${meme.id}`} alt={`Meme ${meme.slug}`} className={m.media} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={f.field}>
              <label htmlFor={`merge-into-${props.memeId}`} className={f.label}>
                {props.candidates.length > 0 ? 'Or paste the original’s link' : 'The original’s link'}
              </label>
              <input
                id={`merge-into-${props.memeId}`}
                className={f.input}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://memecache.me/meme/..."
              />
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
            onClick={merge}
            className={`${styles['button']} ${styles['button-danger']}`}
            disabled={processing || !into}
          >
            Merge
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
