// library/page.tsx

import { db } from '@/db/db';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';

import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';

export default async function Library() {
  const session = await getSession();
  // console.log("session", session);

  if (!session) {
    redirect('/login');
  }

  const memes = await db(
    `SELECT m.*, u.username, u.id as "userId", c.name as "cacheName" FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    WHERE u.id = $1
    ORDER BY "createdAt" ASC`,
    [session.user.id]
  );

  return (
    <>
      <NavigationBar username={session.user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <h1>Library of {session.user.username}</h1>
            <p>{memes.length} items</p>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry memes={memes} />
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
