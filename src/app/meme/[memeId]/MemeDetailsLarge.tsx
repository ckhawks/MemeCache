'use client';

import Link from 'next/link';
import { Download } from 'react-feather';
import d from './MemeDetail.module.scss';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import LikeButton from '@/components/LikeButton';
import SendMemeButton from '@/components/SendMemeButton';
import SaveMemeButton from '@/components/SaveMemeButton';
import Tooltip from '@/components/Tooltip';
import likeStyles from '@/components/LikeButton.module.scss';
import { getRelativeTimeString, getServerSideRelativeTime } from '@/util/datetimeFormat';
import type { MemeCard } from '@/db/queries/memes';
import type { UserPayload } from '@/auth/lib';

// The top of the meme page's side panel: who posted it and when, then the actions.
export function MemeDetailsLarge(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  // The uploader, or a moderator.
  canDelete: boolean;
}) {
  const { meme } = props;
  const when =
    typeof window === 'undefined'
      ? getServerSideRelativeTime(new Date(meme.createdAt))
      : getRelativeTimeString(new Date(meme.createdAt));

  return (
    <>
      <div className={d.uploader}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={'/api/resource/avatar/' + encodeURIComponent(meme.username)}
          alt=""
          width={40}
          height={40}
          className={d.avatar}
        />
        <div className={d.uploaderText}>
          <Link href={'/me/' + encodeURIComponent(meme.username)} className={d.uploaderName}>
            {meme.username}
          </Link>
          <span className={d.when}>Posted {when}</span>
        </div>
      </div>

      <div className={d.actions}>
        <LikeButton memeId={meme.id} userId={props.user?.id || ''} liked={meme.hasLiked} likes={meme.likeCount} />
        {props.user && <SaveMemeButton memeId={meme.id} saved={meme.hasSaved} />}
        <SendMemeButton memeId={meme.id} contentType={meme.contentType} />
        <Tooltip label="Download">
          <a href={`/api/resource/${meme.id}`} download aria-label="Download" className={likeStyles['wrapper']}>
            <Download size={14} className={likeStyles['icon']} />
          </a>
        </Tooltip>
        {props.canDelete && (
          <span className={d.deleteSlot}>
            <DeleteMemeButton memeId={meme.id} asModerator={props.user?.id !== meme.uploaderId} />
          </span>
        )}
      </div>
    </>
  );
}
