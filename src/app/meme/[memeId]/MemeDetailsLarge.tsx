'use client';

import Link from 'next/link';
import { ChevronRight, Download } from 'react-feather';
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

// The top of the meme page's side panel: who posted it, then the actions.
export function MemeDetailsLarge(props: {
  meme: MemeCard;
  user: UserPayload | undefined;
  // The uploader, or a moderator.
  canDelete: boolean;
}) {
  const { meme } = props;

  return (
    <>
      <div className={d.uploader}>
        <Link href={'/me/' + encodeURIComponent(meme.username)} className={d.uploaderCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={'/api/resource/avatar/' + encodeURIComponent(meme.username)}
            alt=""
            width={40}
            height={40}
            className={d.avatar}
          />
          <span className={d.uploaderText}>
            <span className={d.uploaderLabel}>Posted by</span>
            <span className={d.uploaderName}>{meme.username}</span>
          </span>
          <ChevronRight size={16} className={d.uploaderChevron} />
        </Link>
      </div>

      <div className={d.actions}>
        <LikeButton memeId={meme.id} userId={props.user?.id || ''} liked={meme.hasLiked} likes={meme.likeCount} />
        {props.user && <SaveMemeButton memeId={meme.id} saved={meme.hasSaved} />}
        <SendMemeButton memeId={meme.id} slug={meme.slug} contentType={meme.contentType} />
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

// The bottom of the panel: when it was posted, as a date and as a relative time.
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
