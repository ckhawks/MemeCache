'use client';

import { Image } from 'react-bootstrap';
import styles from '../app/main.module.scss';
import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';
import type { ContentWarning } from '@/constants/contentWarnings';
import WarningCover from './WarningCover';

export default function MemeMediaRenderer(props: {
  meme: { id: string; contentType: string; username?: string; warnings?: ContentWarning[] };
  large?: boolean;
}) {
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
        {/* preload + #t=0.1 shows the first frame instead of a blank box. Clicks on the
            controls stay here: a feed card navigates on click, which made play open the
            meme page. */}
        <WarningCover warnings={props.meme.warnings}>
          <video
            controls
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            className={`${styles['meme-media-item']} ${
              props.large ? styles.large : ''
            }`}
            loop
            style={{ display: 'block' }}
          >
            <source src={'/api/resource/' + props.meme.id + '#t=0.1'} />
          </video>
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
