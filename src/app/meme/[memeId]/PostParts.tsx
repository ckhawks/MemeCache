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
import type { MemeCard } from '@/db/queries/memes';
import type { UserPayload } from '@/auth/lib';
import { avatarUrl } from '@/util/avatarUrl';
import { getRelativeTimeString, getServerSideRelativeTime } from '@/util/datetimeFormat';

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
        <span className={d.postAuthorName}>{props.username}</span>
        <span className={d.postKarma}>{props.karma.toLocaleString()} karma</span>
      </span>
    </Link>
  );
}

export function PostActions(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  canDelete: boolean;
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
      />
      {props.user && <SaveMemeButton labeled memeId={meme.id} saved={meme.hasSaved} />}
      <SendMemeButton labeled memeId={meme.id} slug={meme.slug} contentType={meme.contentType} />
      <a href={`/api/resource/${meme.id}`} download className={likeStyles['pill']}>
        <Download size={16} />
        Download
      </a>
      {(canReport || props.canDelete) && (
        <span className={d.postDelete}>
          {canReport && <ReportMemeButton memeId={meme.id} />}
          {props.canDelete && (
            <DeleteMemeButton labeled memeId={meme.id} asModerator={props.user?.id !== meme.uploaderId} />
          )}
        </span>
      )}
    </div>
  );
}

// When it was posted, as a date and as a relative time.
export function MemePosted(props: { createdAt: Date }) {
  const date = new Date(props.createdAt);
  // UTC on both server and browser, so the rendered date cannot differ between them.
  const exact = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const relative =
    typeof window === 'undefined' ? getServerSideRelativeTime(date) : getRelativeTimeString(date);

  return (
    <div className={d.posted}>
      Posted {exact} · {relative}
    </div>
  );
}
