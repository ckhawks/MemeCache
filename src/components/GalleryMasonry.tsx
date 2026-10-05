'use client';

import Masonry from 'react-masonry-css';
import styles from '../app/main.module.scss';
import { getRelativeTimeString, getServerSideRelativeTime } from '@/util/datetimeFormat';
import { Download, MessageCircle } from 'react-feather';
import { useEffect, useRef, useState } from 'react';
import { DOUBLE_TAP_MS, requestLike } from '@/util/likeSignal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LikeButton from './LikeButton';
import MemeMediaRenderer from './MemeMediaRenderer';
import DeleteMemeButton from './DeleteMemeButton';
import SendMemeButton from './SendMemeButton';
import SaveMemeButton from './SaveMemeButton';
import SearchSnippet from './SearchSnippet';
import FeedReason from './FeedReason';
import Tooltip from './Tooltip';
import likeStyles from './LikeButton.module.scss';
import type { MemeCard } from '@/db/queries/memes';
import { avatarUrl } from '@/util/avatarUrl';
import { track } from '@/util/track';
import type { FeedView } from '@/server/feedView';

// Memes arrive newest first from the query. `view` is the viewer's layout choice
// (FeedViewToggle): a multi-column grid, or a single centered column. Search results pass
// `snippets`, the matching text by meme id, shown under each card's title row. For you passes
// `reasons`, the followed tags behind each meme by id, shown in the same place. Search also
// passes `search`, so opening a result records which one it was (a search_click event).
export function GalleryMasonry(props: {
  memes: MemeCard[];
  currentUserId: string;
  view?: FeedView;
  snippets?: Record<string, string | null>;
  reasons?: Record<string, string[]>;
  search?: {
    query: string;
    // How many results came before this page, so positions count from the top result.
    offset: number;
  };
}) {
  const [, forceUpdate] = useState({});
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => forceUpdate({}), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const open = (meme: MemeCard, index: number) => {
    if (props.search) {
      track('search_click', {
        memeId: meme.id,
        query: props.search.query,
        position: props.search.offset + index,
      });
    }
    router.push(`/meme/${meme.slug}`);
  };

  const pendingTap = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const onMediaTap = (event: React.MouseEvent, meme: MemeCard, index: number) => {
    event.stopPropagation();
    const pending = pendingTap.current;
    if (pending && pending.id === meme.id) {
      clearTimeout(pending.timer);
      pendingTap.current = null;
      requestLike(meme.id);
      return;
    }
    if (pending) {
      clearTimeout(pending.timer);
    }
    pendingTap.current = {
      id: meme.id,
      timer: setTimeout(() => {
        pendingTap.current = null;
        open(meme, index);
      }, DOUBLE_TAP_MS),
    };
  };

  const card = (meme: MemeCard, index: number) => (
    <div
      onClick={() => open(meme, index)}
      key={meme.id}
      className={`${styles['meme']}`}
    >
      {/* One tap opens the meme, two like it (only ever like). The single tap waits a
          moment to see if a second follows; taps outside the picture open it at once. */}
      <div onClick={(e) => onMediaTap(e, meme, index)}>
        <MemeMediaRenderer meme={meme} />
      </div>
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
                  track('meme_download', { memeId: meme.id });
                }}
              >
                <Download size={14} className={likeStyles['icon']} />
              </a>
            </Tooltip>
            <SendMemeButton memeId={meme.id} slug={meme.slug} contentType={meme.contentType} />
            {props.currentUserId && <SaveMemeButton memeId={meme.id} saved={meme.hasSaved} />}
            {meme.commentCount > 0 && (
              <Tooltip label={meme.commentCount === 1 ? '1 comment' : `${meme.commentCount} comments`}>
                <Link
                  href={`/meme/${meme.slug}#comments`}
                  aria-label={`Comments (${meme.commentCount})`}
                  className={likeStyles['wrapper']}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle size={14} className={likeStyles['icon']} />
                  <span className={likeStyles['likes']}>{meme.commentCount}</span>
                </Link>
              </Tooltip>
            )}
            <LikeButton
              memeId={meme.id}
              userId={props.currentUserId}
              liked={meme.hasLiked}
              likes={meme.likeCount}
            />
          </div>
        </div>
        {props.snippets?.[meme.id] && <SearchSnippet text={props.snippets[meme.id]!} />}
        {props.reasons?.[meme.id] && <FeedReason followedTags={props.reasons[meme.id]} />}
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
