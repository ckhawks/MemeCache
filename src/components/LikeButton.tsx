import { Heart } from 'react-feather';

import styles from './LikeButton.module.scss';
import { useState } from 'react';
import { api } from '@/util/api';

export default function LikeButton(props: {
  liked: boolean;
  likes: number;
  memeId: string;
  userId: string;
}) {
  const [liked, setLiked] = useState(props.liked);
  const [likes, setLikes] = useState<number>(props.likes);
  const [pending, setPending] = useState(false);

  const onToggleLike = async (event: React.MouseEvent) => {
    event.stopPropagation();

    // Clicking used to do nothing at all when logged out.
    if (props.userId === '') {
      window.location.href = '/login';
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

  return (
    <div onClick={onToggleLike} className={styles['wrapper']}>
      <Heart
        size={14}
        className={`${styles['icon']} ${liked ? styles['liked'] : ''}`}
        fill={liked ? '#e26f6f' : 'none'}
      />
      <span className={`${styles['likes']} ${liked ? styles['liked'] : ''}`}>
        {likes}
      </span>
    </div>
  );
}
