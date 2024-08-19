// GalleryMasonry.tsx
'use client';

import Masonry from 'react-masonry-css';
import styles from '../app/main.module.scss';
import { Image } from 'react-bootstrap';
import {
  getRelativeTimeString,
  getServerSideRelativeTime,
} from '@/util/datetimeFormat';
import { Folder } from 'react-feather';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LikeButton from './LikeButton';

export function GalleryMasonry(props: { memes: any[]; currentUserId: string }) {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const timer = setInterval(() => forceUpdate({}), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const reversedMemes = useMemo(
    () => [...props.memes].reverse(),
    [props.memes]
  );

  return (
    <>
      <div className={styles.gallery}>
        <Masonry
          breakpointCols={3}
          // breakpointCols={{
          //   default: 3,
          //   1280: 2,
          //   850: 1,
          // }}
          className="my-masonry-grid"
          columnClassName="my-masonry-grid_column"
        >
          {reversedMemes.map((meme) => {
            return (
              <div key={meme.id} className={`${styles['meme']}`}>
                <Image
                  className={styles['meme-media']}
                  src={'/api/resource/' + meme.id}
                  alt="visual meme :("
                />
                <div className={styles['meme-body']}>
                  <div className={styles['meme-body-title']}>
                    <Folder size={14} /> <span>{meme.cacheName}</span>{' '}
                    <LikeButton
                      memeId={meme.id}
                      userId={props.currentUserId}
                      liked={meme.hasLiked}
                      likes={meme.likeCount}
                    />
                  </div>
                  <div className={styles['meme-body-date']}>
                    {typeof window === 'undefined'
                      ? getServerSideRelativeTime(new Date(meme.createdAt))
                      : getRelativeTimeString(new Date(meme.createdAt))}{' '}
                    by{' '}
                    <Link
                      href={'/me/' + meme.username}
                      className={styles['meme-username']}
                    >
                      {meme.username}
                    </Link>
                    {/* {meme.createdAt.toISOString()} */}
                  </div>
                </div>
              </div>
            );
          })}
        </Masonry>
      </div>
      <style jsx global>
        {`
          .gallery {
            margin: auto;
            max-width: 1200px;
          }
          .my-masonry-grid {
            display: -webkit-box; /* Not needed if autoprefixing */
            display: -ms-flexbox; /* Not needed if autoprefixing */
            display: flex;
            margin-left: -20px; /* gutter size offset */
            width: auto;
          }
          .my-masonry-grid_column {
            padding-left: 20px; /* gutter size */
            background-clip: padding-box;
          }

          /* Style your items */
          .my-masonry-grid_column > img {
            /* change div to reference your elements you put in <Masonry> */
          }
          @media screen and (max-width: 1280px) {
            .my-masonry-grid {
              margin-left: none;
            }

            .my-masonry-grid_column {
              padding-left: none;
            }
          }
        `}
      </style>
    </>
  );
}
