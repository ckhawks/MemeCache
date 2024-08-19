// library/page.tsx

import { db } from '@/db/db';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import { Plus } from 'react-feather';
import { Button } from 'react-bootstrap';
import CacheAccordion from './CacheAccordion';
import FooterBar from '@/components/FooterBar';
import Link from 'next/link';

export default async function Profile({
  params,
}: {
  params: { username: string };
}) {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  if (params.username === null) {
    return (
      <>
        <NavigationBar username={(user && user.username) || ''} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>Please enter a profile name.</p>
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
        <NavigationBar username={(user && user.username) || ''} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>
                Couldn&apos;t find a profile for <b>{params.username}</b>.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const userFromDb = users[0];

  const caches = await db(
    `SELECT * FROM "Cache" c
    WHERE "ownerUserId" = $1`,
    [userFromDb.id]
  );

  // const memes = await db(
  //   `SELECT m.*, u.username, u.id as "userId", c.name as "cacheName", c.id as "cacheId" FROM "Meme" m
  //   LEFT JOIN "User" u ON u.id = m."uploaderUserId"
  //   LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
  //   LEFT JOIN "Cache" c ON c.id = mc."cacheId"
  //   WHERE u.id = $1
  //   ORDER BY "createdAt" ASC`,
  //   [userFromDb.id]
  // );

  const memes = await db(
    `
    SELECT 
      m.*, 
      u.username, 
      u.id as "userId", 
      c.id as "cacheId",
      c.name as "cacheName",
      COUNT(l.id) as "likeCount",
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM "Like" l2 
          WHERE l2."memeId" = m.id AND l2."userId" = $2
        ) THEN true 
        ELSE false 
      END as "hasLiked"
    FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    LEFT JOIN "Like" l ON l."memeId" = m.id
    WHERE u.id = $1
    GROUP BY m.id, u.username, u.id, c.name, c.id
    ORDER BY m."createdAt" ASC
    `,
    [userFromDb?.id, user?.id]
  );

  // console.log(memes.length);

  const memesByCache = memes.reduce((acc, meme) => {
    const cacheId = meme.cacheId || null; // Handle uncached memes
    if (!acc[cacheId]) {
      acc[cacheId] = [];
    }
    acc[cacheId].push(meme);
    return acc;
  }, {});

  // console.log(memesByCache);

  const isCurrentUser = user?.id === userFromDb.id;

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <img
                  src={'/api/resource/avatar/' + userFromDb.username}
                  width={128}
                  height={128}
                  style={{ borderRadius: '100%' }}
                  // className={}
                />
                <h1>{userFromDb?.username}</h1>
                {isCurrentUser && (
                  <Link
                    href={'/me/' + user?.username + '/edit'}
                    className={`${styles['button']} ${styles['button-secondary']}`}
                  >
                    Edit profile
                  </Link>
                )}
              </div>

              {isCurrentUser && (
                <Button
                  style={{ height: '40px' }}
                  className={`${styles['button']} ${styles['button-secondary']}`}
                >
                  <Plus size={14} /> Cache
                </Button>
              )}
            </div>

            <p>{memes?.length || 0} total items</p>
          </div>
          {caches &&
            caches.map((cache) => (
              <CacheAccordion
                cache={cache as any}
                memes={memesByCache[cache.id] || []}
                key={cache.id}
                isCurrentUser
                userId={user?.id || ''}
              />
            ))}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
