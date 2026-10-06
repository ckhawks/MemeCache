'use client';

import Link from 'next/link';
import { Download } from 'react-feather';
import d from './MemeDetail.module.scss';
import likeStyles from '@/components/LikeButton.module.scss';
import LikeButton from '@/components/LikeButton';
import SaveMemeButton from '@/components/SaveMemeButton';
import SendMemeButton from '@/components/SendMemeButton';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import ReportMemeButton from '@/components/ReportMemeButton';
import TakedownButton from '@/components/TakedownButton';
import { displayUsername } from '@/auth/username';
import type { MemeCard } from '@/db/queries/memes';
import type { UserPayload } from '@/auth/lib';
import { avatarUrl } from '@/util/avatarUrl';
import { timeAgo } from '@/util/datetimeFormat';
import { formatCount } from '@/util/formatCount';
import { track } from '@/util/track';
import { memeFilename } from '@/constants/mimeTypes';

// Pieces of the meme page: the author line, the action bar, and the posted date.

export function PostAuthor(props: {
  username: string;
  avatarKey: string | null;
  karma: number;
}) {
  return (
    <Link href={'/me/' + encodeURIComponent(props.username)} className={d.postAuthor}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(props.username, props.avatarKey)}
        alt=""
        width={36}
        height={36}
        className={d.postAvatar}
      />
      <span className={d.postAuthorText}>
        <span className={d.postAuthorName}>{displayUsername(props.username)}</span>
        <span className={d.postKarma}>{props.karma.toLocaleString()} karma</span>
      </span>
    </Link>
  );
}

export function PostActions(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  canDelete: boolean;
  // Admins: take it down for a copyright claim or similar (migration 018).
  canTakeDown: boolean;
}) {
  const { meme } = props;
  // Members can report other people's memes, not their own.
  const canReport = !!props.user && props.user.id !== meme.uploaderId;
  return (
    <div className={d.postActions}>
      <LikeButton
        labeled
        memeId={meme.id}
        userId={props.user?.id || ''}
        liked={meme.hasLiked}
        likes={meme.likeCount}
        own={props.user?.id === meme.uploaderId}
      />
      {props.user && <SaveMemeButton labeled memeId={meme.id} saved={meme.hasSaved} />}
      <SendMemeButton labeled memeId={meme.id} slug={meme.slug} contentType={meme.contentType} />
      <a
        href={`/api/resource/${meme.id}`}
        download={memeFilename(meme.slug, meme.contentType)}
        className={likeStyles['pill']}
        onClick={() => track('meme_download', { memeId: meme.id })}
      >
        <Download size={16} />
        Download
      </a>
      {(canReport || props.canDelete || props.canTakeDown) && (
        <span className={d.postDelete}>
          {canReport && <ReportMemeButton memeId={meme.id} />}
          {props.canDelete && (
            <DeleteMemeButton labeled memeId={meme.id} asModerator={props.user?.id !== meme.uploaderId} />
          )}
          {props.canTakeDown && <TakedownButton memeId={meme.id} />}
        </span>
      )}
    </div>
  );
}

// When it was posted, as a date and as a relative time, and how many times it was viewed.
export function MemePosted(props: { createdAt: Date; viewCount: number; sourceUrl: string | null }) {
  const date = new Date(props.createdAt);
  // UTC on both server and browser, so the rendered date cannot differ between them.
  const exact = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const views = props.viewCount;

  return (
    <div className={d.posted}>
      Posted {exact} ·{' '}
      {/* The server's clock renders it first; the browser's may read a minute on. */}
      <span suppressHydrationWarning>{timeAgo(date)}</span> ·{' '}
      <span title={views >= 1000 ? `${views.toLocaleString()} views` : undefined}>
        {formatCount(views)} {views === 1 ? 'view' : 'views'}
      </span>
      {props.sourceUrl && (
        <>
          {' '}
          · Source:{' '}
          <a href={props.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={d.source}>
            {sourceHost(props.sourceUrl)}
          </a>
        </>
      )}
    </div>
  );
}

// "x.com" for https://www.x.com/someone/status/1. The stored link is already normalized.
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
