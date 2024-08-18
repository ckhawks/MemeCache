'use client';

import Link from 'next/link';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function OnlineUsers() {
  const { data, error } = useSWR('/api/users/online', fetcher);

  if (error) return <div>Failed to load</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h4>Online Users (15m)</h4>
      <ul>
        {data.onlineUsers.map((user: any) => (
          <li key={user.id}>
            <Link
              href={'/me/' + user.username}
              style={{
                textDecoration: 'none',
                color: 'unset',
                fontWeight: 500,
              }}
            >
              {user.username}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
