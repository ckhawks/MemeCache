'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'react-feather';
import main from '../app/main.module.scss';
import styles from './TagFollowButtons.module.scss';
import { api } from '@/util/api';

// Follow and Following for one member (migration 020), on their profile. Only shown to
// signed-in members looking at someone else. Following unfollows when pressed. Once saved,
// the page refreshes so the follower count beside it catches up.
export default function FollowButton(props: {
  userId: string;
  username: string;
  following: boolean;
}) {
  const [following, setFollowing] = useState(props.following);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const change = async (next: boolean) => {
    if (pending) {
      return;
    }
    // Optimistic, rolled back on failure.
    const previous = following;
    setFollowing(next);
    setPending(true);
    setError('');
    try {
      await api(`/api/users/${props.userId}/follow`, { body: { following: next } });
      router.refresh();
    } catch (e) {
      setFollowing(previous);
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setPending(false);
    }
  };

  const small = `${main.button} ${main['button-small']}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        {following ? (
          <button
            type="button"
            className={`${small} ${main['button-success']}`}
            onClick={() => change(false)}
            aria-label={`Unfollow ${props.username}`}
            aria-pressed="true"
          >
            <Check size={14} /> Following
          </button>
        ) : (
          <button
            type="button"
            className={small}
            onClick={() => change(true)}
            aria-label={`Follow ${props.username}`}
            aria-pressed="false"
          >
            <Plus size={14} /> Follow
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
