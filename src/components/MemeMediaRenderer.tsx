'use client';

import { Image } from 'react-bootstrap';
import styles from '../app/main.module.scss';
import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';
import type { ContentWarning } from '@/constants/contentWarnings';
import WarningCover from './WarningCover';
import MemeVideo from './MemeVideo';
import { useState } from 'react';
import { blursMeme } from '@/constants/contentWarnings';

export default function MemeMediaRenderer(props: {
  meme: {
    id: string;
    contentType: string;
    username?: string;
    warnings?: ContentWarning[];
    hasAudio?: boolean | null;
  };
  large?: boolean;
}) {
  // A GIF-like video stays still while it is blurred.
  const [revealed, setRevealed] = useState(false);
  const blurred = (props.meme.warnings ?? []).some(blursMeme);

  if (supportedImageTypes.indexOf(props.meme?.contentType) > -1) {
    return (
      <div
        className={`${styles['meme-media']} ${props.large ? styles.large : ''}`}
      >
        <WarningCover warnings={props.meme.warnings}>
          <Image
            src={'/api/resource/' + props.meme.id}
            alt={props.meme.username ? `Meme by ${props.meme.username}` : 'Meme'}
            className={`${styles['meme-media-item']} ${
              props.large ? styles.large : ''
            }`}
          />
        </WarningCover>
      </div>
    );
  }

  if (supportedVideoTypes.indexOf(props.meme?.contentType) > -1) {
    return (
      <div
        className={`${styles['meme-media']} ${props.large ? styles.large : ''}`}
      >
        <WarningCover warnings={props.meme.warnings} onReveal={() => setRevealed(true)}>
          <MemeVideo
            src={'/api/resource/' + props.meme.id}
            hasAudio={props.meme.hasAudio}
            hold={blurred && !revealed}
            className={`${styles['meme-media-item']} ${props.large ? styles.large : ''}`}
            style={{ display: 'block' }}
          />
        </WarningCover>
      </div>
    );
  }

  return (
    <div className={styles['meme-media']}>
      Unsupported media type <b>{props.meme.contentType}</b>.
    </div>
  );
}
