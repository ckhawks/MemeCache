'use client';

import Masonry from 'react-masonry-css';
import styles from '../app/main.module.scss';
import { getRelativeTimeString, getServerSideRelativeTime } from '@/util/datetimeFormat';
import { Download } from 'react-feather';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LikeButton from './LikeButton';
import MemeMediaRenderer from './MemeMediaRenderer';
import DeleteMemeButton from './DeleteMemeButton';
import SendMemeButton from './SendMemeButton';
import SaveMemeButton from './SaveMemeButton';
import Tooltip from './Tooltip';
import likeStyles from './LikeButton.module.scss';
import type { MemeCard } from '@/db/queries/memes';
import { avatarUrl } from '@/util/avatarUrl';
import type { FeedView } from '@/server/feedView';

// Memes arrive newest first from the query. `view` is the viewer's layout choice
// (FeedViewToggle): a multi-column grid, or a single centered column.
export function GalleryMasonry(props: {
  memes: MemeCard[];
  currentUserId: string;
  view?: FeedView;
}) {
  const [, forceUpdate] = useState({});
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => forceUpdate({}), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const card = (meme: MemeCard) => (
    <div
      onClick={() => router.push(`/meme/${meme.slug}`)}
      key={meme.id}
      className={`${styles['meme']}`}
    >
      <MemeMediaRenderer meme={meme} />
      <div className={styles['meme-body']}>
        {/* One row: who, then when, then the actions. */}
        <div className={styles['meme-body-title']}>
          <div className={styles['meme-body-date']}>
            <Link
              href={'/me/' + meme.username}
              className={styles['meme-username']}
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl(meme.username, meme.avatarKey)}
                alt=""
                width={20}
                height={20}
                loading="lazy"
                className={styles['meme-avatar']}
              />
              {meme.username}
              <span className={styles['meme-karma']} title="Karma">
                {meme.karma.toLocaleString()}
              </span>
            </Link>
            <span className={styles['meme-meta-separator']}>·</span>
            <span className={styles['meme-body-time']}>
              {typeof window === 'undefined'
                ? getServerSideRelativeTime(new Date(meme.createdAt))
                : getRelativeTimeString(new Date(meme.createdAt))}
            </span>
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
            {/* Only your own memes. Moderators delete others' from the meme page, on
                purpose, rather than one stray click away in a feed. */}
            {props.currentUserId === meme.uploaderId && <DeleteMemeButton memeId={meme.id} />}
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
            <SendMemeButton memeId={meme.id} slug={meme.slug} contentType={meme.contentType} />
            {props.currentUserId && <SaveMemeButton memeId={meme.id} saved={meme.hasSaved} />}
            <LikeButton
              memeId={meme.id}
              userId={props.currentUserId}
              liked={meme.hasLiked}
              likes={meme.likeCount}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (props.view === 'feed') {
    return <div className={styles['feed']}>{props.memes.map(card)}</div>;
  }

  return (
    <div className={styles.gallery}>
      <Masonry
        // Keys are max viewport widths in px. Cards fill their column at every width.
        breakpointCols={{
          default: 3,
          1100: 2,
          600: 1,
        }}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {props.memes.map(card)}
      </Masonry>
    </div>
  );
}
