// library/page.tsx

import { db } from '@/db/db';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';

import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';

export default async function Library() {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  if (!user) {
    redirect('/login');
  }

  const memes = await db(
    `SELECT m.*, u.username, u.id as "userId", c.name as "cacheName" FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    WHERE u.id = $1
    ORDER BY "createdAt" ASC`,
    [user.id]
  );

  return (
    <>
      <NavigationBar username={user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <h1>Library of {user.username}</h1>
            <p>{memes?.length || 0} items</p>
          </div>
          {memes && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry memes={memes} />
            </div>
          )}
          {memes?.length == 0 && <p>No memes found.</p>}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
