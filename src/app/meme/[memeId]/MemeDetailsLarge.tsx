'use client';

import styles from '../../main.module.scss';
import MemeMediaRenderer from '@/components/MemeMediaRenderer';
import Link from 'next/link';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import LikeButton from '@/components/LikeButton';
import SendMemeButton from '@/components/SendMemeButton';
import Tooltip from '@/components/Tooltip';
import { Download } from 'react-feather';
import {
  getRelativeTimeString,
  getServerSideRelativeTime,
} from '@/util/datetimeFormat';
import type { MemeCard } from '@/db/queries/memes';
import type { UserPayload } from '@/auth/lib';

export function MemeDetailsLarge(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  // The uploader, or a moderator.
  canDelete: boolean;
}) {
  return (
    <div key={props.meme.id} className={`${styles['meme']} ${styles.large}`}>
      <MemeMediaRenderer meme={props.meme} large />
      <div className={styles['meme-body']}>
        <div className={styles['meme-body-title']}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              marginLeft: 'auto',
            }}
          >
            {props.canDelete && (
              <DeleteMemeButton
                memeId={props.meme.id}
                asModerator={props.user?.id !== props.meme.uploaderId}
              />
            )}
            <Tooltip label="Download">
              <a
                href={`/api/resource/${props.meme.id}`}
                download
                style={{
                  color: 'gray',
                }}
              >
                <Download size={14} />
              </a>
            </Tooltip>
            <SendMemeButton memeId={props.meme.id} contentType={props.meme.contentType} />
            <LikeButton
              memeId={props.meme.id}
              userId={props.user?.id || ''}
              liked={props.meme.hasLiked}
              likes={props.meme.likeCount}
            />
          </div>
        </div>
        <div className={styles['meme-body-date']}>
          {typeof window === 'undefined'
            ? getServerSideRelativeTime(new Date(props.meme.createdAt))
            : getRelativeTimeString(new Date(props.meme.createdAt))}{' '}
          by{' '}
          <Link
            href={'/me/' + props.meme.username}
            className={styles['meme-username']}
          >
            {props.meme.username}
          </Link>
          {/* {meme.createdAt.toISOString()} */}
        </div>
      </div>
    </div>
  );
}
