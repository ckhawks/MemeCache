import { Heart } from 'react-feather';

import styles from './LikeButton.module.scss';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onLikeRequest } from '@/util/likeSignal';
import { api } from '@/util/api';
import Link from 'next/link';
import Tooltip from './Tooltip';

export default function LikeButton(props: {
  liked: boolean;
  likes: number;
  memeId: string;
  userId: string;
  // A pill with a word, for the meme page, instead of the bare icon used on cards.
  labeled?: boolean;
}) {
  const [liked, setLiked] = useState(props.liked);
  const [likes, setLikes] = useState<number>(props.likes);
  // Signed out: a click swaps the count for a login link for a few seconds.
  const [loginPrompt, setLoginPrompt] = useState(false);
  // A short pulse when a double tap on the meme liked it, so the like is seen to happen.
  const [pulse, setPulse] = useState(false);

  // The double-tap listener reads these, so they live in refs as well as state.
  const likedRef = useRef(liked);
  const pendingRef = useRef(false);
  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);

  const setLike = useCallback(
    async (next: boolean) => {
      // Signed out: say why nothing happened, instead of silently doing nothing (the old
      // behavior) or yanking the visitor to the login page (the one after that).
      if (props.userId === '') {
        setLoginPrompt(true);
        setTimeout(() => setLoginPrompt(false), 3000);
        return;
      }
      if (pendingRef.current) {
        return;
      }
      pendingRef.current = true;

      // Optimistic: flip now, settle on the server's count, roll back on failure.
      setLiked(next);
      likedRef.current = next;
      setLikes((count) => count + (next ? 1 : -1));

      try {
        const result = await api<{ likeCount: number }>(`/api/meme/${props.memeId}/like`, {
          body: { liked: next },
        });
        setLikes(result.likeCount);
      } catch (error) {
        setLiked(!next);
        likedRef.current = !next;
        setLikes((count) => count - (next ? 1 : -1));
        console.error('Failed to change like:', error);
      } finally {
        pendingRef.current = false;
      }
    },
    [props.memeId, props.userId]
  );

  const onToggleLike = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await setLike(!liked);
  };

  // Double tap on the meme (see likeSignal): like it if not liked yet, and pulse either way.
  useEffect(
    () =>
      onLikeRequest(props.memeId, () => {
        if (!likedRef.current) {
          void setLike(true);
        }
        setPulse(true);
        setTimeout(() => setPulse(false), 450);
      }),
    [props.memeId, setLike]
  );

  const label = props.userId === '' ? 'Log in to like' : liked ? 'Unlike' : 'Like';

  if (props.labeled) {
    return (
      <button
        type="button"
        onClick={onToggleLike}
        className={`${styles['pill']} ${liked ? styles['pillActive'] : ''}`}
        aria-label={label}
      >
        <Heart
          size={16}
          className={`${liked ? styles['liked'] : ''} ${pulse ? styles['pulse'] : ''}`}
          fill={liked ? '#e26f6f' : 'none'}
        />
        {loginPrompt ? (
          <Link href="/login" onClick={(e) => e.stopPropagation()}>
            Log in to like
          </Link>
        ) : (
          <>
            {liked ? 'Liked' : 'Like'} · {likes}
          </>
        )}
      </button>
    );
  }

  return (
    // The like sits at the right edge of a card, so its label anchors to the right.
    <Tooltip label={label} align="end">
      <button type="button" onClick={onToggleLike} className={styles['wrapper']} aria-label={label}>
        <Heart
          size={14}
          className={`${styles['icon']} ${liked ? styles['liked'] : ''} ${pulse ? styles['pulse'] : ''}`}
          fill={liked ? '#e26f6f' : 'none'}
        />
        {loginPrompt ? (
          <Link href="/login" className={styles['likes']} onClick={(e) => e.stopPropagation()}>
            Log in to like
          </Link>
        ) : (
          <span className={`${styles['likes']} ${liked ? styles['liked'] : ''}`}>{likes}</span>
        )}
      </button>
    </Tooltip>
  );
}
