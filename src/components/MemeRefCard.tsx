'use client';

import Link from 'next/link';
import { X } from 'react-feather';
import styles from './MemeRefCard.module.scss';
import WarningCover from './WarningCover';
import { displayUsername } from '@/auth/username';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import type { MemeRef } from '@/db/queries/comments';

// A meme as a small square: the first frame of a video, blurred with its labels when it
// has content warnings. Fills whatever box holds it.
export function MemeThumb(props: { meme: MemeRef }) {
  const src = `/api/resource/${props.meme.id}`;
  return (
    <WarningCover compact warnings={props.meme.warnings} className={styles['thumb-cover']}>
      {supportedVideoTypes.includes(props.meme.contentType) ? (
        <video src={src + '#t=0.1'} preload="metadata" muted className={styles['thumb-media']} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Meme by ${displayUsername(props.meme.username)}`} loading="lazy" className={styles['thumb-media']} />
      )}
    </WarningCover>
  );
}

// A meme someone replied with in a comment: a thumbnail and its uploader, linking to its
// page. With `onRemove` it is the comment box's preview of the attached meme instead, with
// a button to take it off and no link.
export default function MemeRefCard(props: { meme: MemeRef; onRemove?: () => void }) {
  const inner = (
    <>
      <span className={styles['thumb']}>
        <MemeThumb meme={props.meme} />
      </span>
      <span className={styles['caption']}>
        Meme by <strong>{displayUsername(props.meme.username)}</strong>
      </span>
    </>
  );

  if (props.onRemove) {
    return (
      <div className={styles['card']}>
        {inner}
        <button
          type="button"
          className={styles['remove']}
          onClick={props.onRemove}
          aria-label="Remove the attached meme"
          title="Remove"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <Link href={`/meme/${props.meme.slug}`} className={`${styles['card']} ${styles['link']}`}>
      {inner}
    </Link>
  );
}
