import { Heart } from 'react-feather';

import styles from './LikeButton.module.scss';
import { useState } from 'react';
import { api } from '@/util/api';
import Link from 'next/link';
import Tooltip from './Tooltip';

export default function LikeButton(props: {
  liked: boolean;
  likes: number;
  memeId: string;
  userId: string;
}) {
  const [liked, setLiked] = useState(props.liked);
  const [likes, setLikes] = useState<number>(props.likes);
  const [pending, setPending] = useState(false);
  // Signed out: a click swaps the count for a login link for a few seconds.
  const [loginPrompt, setLoginPrompt] = useState(false);

  const onToggleLike = async (event: React.MouseEvent) => {
    event.stopPropagation();

    // Signed out: say why nothing happened, instead of silently doing nothing (the old
    // behavior) or yanking the visitor to the login page (the one after that).
    if (props.userId === '') {
      setLoginPrompt(true);
      setTimeout(() => setLoginPrompt(false), 3000);
      return;
    }
    if (pending) {
      return;
    }

    // Optimistic: flip now, settle on the server's count, roll back on failure.
    const next = !liked;
    setLiked(next);
    setLikes(likes + (next ? 1 : -1));
    setPending(true);

    try {
      const result = await api<{ likeCount: number }>(`/api/meme/${props.memeId}/like`, {
        body: { liked: next },
      });
      setLikes(result.likeCount);
    } catch (error) {
      setLiked(!next);
      setLikes(likes);
      console.error('Failed to change like:', error);
    } finally {
      setPending(false);
    }
  };

  const label = props.userId === '' ? 'Log in to like' : liked ? 'Unlike' : 'Like';

  return (
    // The like sits at the right edge of a card, so its label anchors to the right.
    <Tooltip label={label} align="end">
      <div onClick={onToggleLike} className={styles['wrapper']}>
        <Heart
          size={14}
          className={`${styles['icon']} ${liked ? styles['liked'] : ''}`}
          fill={liked ? '#e26f6f' : 'none'}
        />
        {loginPrompt ? (
          <Link href="/login" className={styles['likes']} onClick={(e) => e.stopPropagation()}>
            Log in to like
          </Link>
        ) : (
          <span className={`${styles['likes']} ${liked ? styles['liked'] : ''}`}>{likes}</span>
        )}
      </div>
    </Tooltip>
  );
}
