// GalleryMasonry.tsx
'use client';

import Masonry from 'react-masonry-css';
import styles from '../app/main.module.scss';
import {
  getRelativeTimeString,
  getServerSideRelativeTime,
} from '@/util/datetimeFormat';
import { Download } from 'react-feather';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import LikeButton from './LikeButton';
import MemeMediaRenderer from './MemeMediaRenderer';
import DeleteMemeButton from './DeleteMemeButton';
import SendMemeButton from './SendMemeButton';
import SaveMemeButton from './SaveMemeButton';
import Tooltip from './Tooltip';
import likeStyles from './LikeButton.module.scss';
import type { MemeCard } from '@/db/queries/memes';

// Memes arrive newest first from the query.
export function GalleryMasonry(props: {
  memes: MemeCard[];
  currentUserId: string;
}) {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const timer = setInterval(() => forceUpdate({}), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div className={styles.gallery}>
        <Masonry
          // Keys are max widths in px, matching the card max-width rule in main.module.scss.
          breakpointCols={{
            default: 3,
            1000: 2,
            600: 1,
          }}
          className="my-masonry-grid"
          columnClassName="my-masonry-grid_column"
        >
          {props.memes.map((meme) => {
            return (
              <div
                onClick={() => {
                  window.location.href = `/meme/${meme.id}`;
                }}
                key={meme.id}
                className={`${styles['meme']}`}
              >
                <MemeMediaRenderer meme={meme} />
                <div className={styles['meme-body']}>
                  {/* One row: who and when on the left, actions on the right. */}
                  <div className={styles['meme-body-title']}>
                    <div className={styles['meme-body-date']}>
                      {typeof window === 'undefined'
                        ? getServerSideRelativeTime(new Date(meme.createdAt))
                        : getRelativeTimeString(new Date(meme.createdAt))}{' '}
                      by{' '}
                      <Link
                        href={'/me/' + meme.username}
                        className={styles['meme-username']}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {meme.username}
                      </Link>
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '8px',
                        marginLeft: 'auto',
                      }}
                    >
                      {/* Only your own memes. Moderators delete others' from the meme page, on purpose,
                          rather than one stray click away in a feed. */}
                      {props.currentUserId === meme.uploaderId && (
                        <DeleteMemeButton memeId={meme.id} />
                      )}
                      <Tooltip label="Download">
                        <a
                          href={`/api/resource/${meme.id}`}
                          download
                          aria-label="Download"
                          className={likeStyles['wrapper']}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Download size={14} className={likeStyles['icon']} />
                        </a>
                      </Tooltip>
                      <SendMemeButton memeId={meme.id} contentType={meme.contentType} />
                      {props.currentUserId && (
                        <SaveMemeButton memeId={meme.id} saved={meme.hasSaved} />
                      )}
                      <LikeButton
                        memeId={meme.id}
                        userId={props.currentUserId}
                        liked={meme.hasLiked}
                        likes={meme.likeCount}
                      />
                    </div>
                  </div>
                  {/* <div className={styles['tag-chips']}>
                    <TagChip tag={'brakence'} />
                    <TagChip tag={'depression'} />
                    <span className={styles['tags-extra']}>+4</span>
                  </div> */}
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
