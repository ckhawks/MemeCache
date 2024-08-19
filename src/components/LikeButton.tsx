import { Heart } from 'react-feather';

import styles from './LikeButton.module.scss';
import { useState } from 'react';

export default function LikeButton(props: {
  liked: boolean;
  likes: number;
  memeId: string;
  userId: string;
}) {
  const [liked, setLiked] = useState(props.liked);
  const [likes, setLikes] = useState<number>(props.likes);

  const onToggleLike = async (event: any) => {
    if (props.userId === '') {
      return;
    }

    setLiked(!liked);

    // this condition is reversed because the value hasn't really changed yet
    if (!liked) {
      setLikes(props.likes);
    } else {
      setLikes(props.likes);
    }
    await handleChangeLikeState();
  };

  const handleChangeLikeState = async () => {
    const formData = new FormData();
    formData.append('memeId', props.memeId);
    formData.append('userId', props.userId);
    formData.append('status', (!liked).toString());
    // formData.append('cacheId', cacheId);

    try {
      const response = await fetch('/api/like', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setLikes(result.newLikeCount);
        // console.log()
        // setMessage(result.message);
      } else {
        console.log(
          'Failed to change like to ' +
            liked +
            ', ' +
            (result.error || 'Something went wrong')
        );
        // setMessage(result.error || 'Something went wrong');
      }
    } catch (error) {
      console.log('failed to change like status, ' + error);
      // setMessage('Failed to upload file');
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
