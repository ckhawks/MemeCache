'use client';

import styles from '../../main.module.scss';
import MemeMediaRenderer from '@/components/MemeMediaRenderer';
import Link from 'next/link';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import LikeButton from '@/components/LikeButton';
import { Folder } from 'react-feather';
import {
  getRelativeTimeString,
  getServerSideRelativeTime,
} from '@/util/datetimeFormat';

export function MemeDetailsLarge(props: { meme: any; user: any }) {
  return (
    <div key={props.meme.id} className={`${styles['meme']} ${styles.large}`}>
      <MemeMediaRenderer meme={props.meme} large />
      <div className={styles['meme-body']}>
        <div className={styles['meme-body-title']}>
          <Folder size={14} /> <span>{props.meme.cacheName}</span>{' '}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              marginLeft: 'auto',
            }}
          >
            {props.user?.id === props.meme.userId && (
              <DeleteMemeButton
                memeId={props.meme.id}
                userId={props.user?.id || ''}
              />
            )}
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
