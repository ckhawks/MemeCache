'use client';

import Link from 'next/link';
import useSWR from 'swr';
import styles from './OnlineUsers.module.scss';
import { avatarUrl } from '@/util/avatarUrl';
import type { OnlineUser } from '@/db/queries/users';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Who was active in the last 15 minutes, as a row of avatar chips.
export default function OnlineUsers() {
  const { data, error } = useSWR<{ onlineUsers: OnlineUser[] }>(
    '/api/users/online',
    fetcher
  );

  if (error || !data) {
    return null;
  }

  const users = data.onlineUsers;

  return (
    <div className={styles.online}>
      {users.length === 0 ? (
        <span className={styles.label}>Nobody else is around right now.</span>
      ) : (
        <>
          <span className={styles.label}>Online now</span>
          {users.map((user) => (
            <Link key={user.id} href={'/me/' + encodeURIComponent(user.username)} className={styles.chip}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl(user.username, user.avatarKey)} alt="" width={18} height={18} />
              {user.username}
              <span className={styles.karma} title="Karma">
                {user.karma.toLocaleString()}
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
