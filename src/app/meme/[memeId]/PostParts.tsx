'use client';

import Link from 'next/link';
import { Download } from 'react-feather';
import d from './MemeDetail.module.scss';
import likeStyles from '@/components/LikeButton.module.scss';
import LikeButton from '@/components/LikeButton';
import SaveMemeButton from '@/components/SaveMemeButton';
import SendMemeButton from '@/components/SendMemeButton';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import type { MemeCard } from '@/db/queries/memes';
import type { UserPayload } from '@/auth/lib';

// Pieces for the meme page layouts A and B (?layout=a, ?layout=b): an author row and a row
// of labeled action pills.

export function PostAuthor(props: { username: string }) {
  return (
    <Link href={'/me/' + encodeURIComponent(props.username)} className={d.postAuthor}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={'/api/resource/avatar/' + encodeURIComponent(props.username)}
        alt=""
        width={36}
        height={36}
        className={d.postAvatar}
      />
      <span className={d.postAuthorName}>{props.username}</span>
    </Link>
  );
}

export function PostActions(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  canDelete: boolean;
}) {
  const { meme } = props;
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
      {props.canDelete && (
        <span className={d.postDelete}>
          <DeleteMemeButton labeled memeId={meme.id} asModerator={props.user?.id !== meme.uploaderId} />
        </span>
      )}
    </div>
  );
}
