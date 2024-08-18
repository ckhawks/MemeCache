// library/page.tsx

import { db } from '@/db/db';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';

import { GalleryMasonry } from '../../../components/GalleryMasonry';
import { Folder } from 'react-feather';

export default async function Profile({
  params,
}: {
  params: { username: string };
}) {
  const session = await getSession();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  if (params.username === null) {
    return (
      <>
        <NavigationBar username={session && session.user.username} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>Please profile a profile name.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const users = await db(
    `SELECT u.id, u.username, u."createdAt" FROM "User" u
    WHERE u.username = $1`,
    [params.username]
  );

  if (users.length === 0) {
    return (
      <>
        <NavigationBar username={session && session.user.username} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>
                Couldn't find a profile for <b>{params.username}</b>.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const user = users[0];

  const caches = await db(
    `SELECT * FROM "Cache" c
    WHERE "ownerUserId" = $1`,
    [user.id]
  );

  const memes = await db(
    `SELECT m.*, u.username, u.id as "userId", c.name as "cacheName", c.id as "cacheId" FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    WHERE u.id = $1
    ORDER BY "createdAt" ASC`,
    [user.id]
  );

  const memesByCache = memes.reduce((acc, meme) => {
    const cacheId = meme.cacheId || null; // Handle uncached memes
    if (!acc[cacheId]) {
      acc[cacheId] = [];
    }
    acc[cacheId].push(meme);
    return acc;
  }, {});

  return (
    <>
      <NavigationBar username={session && session.user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <h1>{user.username}</h1>
            <p>{memes.length} total items</p>
          </div>
          {caches &&
            caches.map((cache) => (
              <div key={cache.id}>
                <h3>
                  <Folder size={28} /> {cache.name}
                </h3>{' '}
                <p>{memesByCache[cache.id].length} items</p>
                <div className={styles['memes-masonry']}>
                  <GalleryMasonry memes={memesByCache[cache.id]} />
                </div>
              </div>
            ))}
        </div>
      </main>
    </>
  );
}
