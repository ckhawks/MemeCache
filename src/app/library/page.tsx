import { db } from '@/db/db';
import styles from '../main.module.scss';
import { Button, Image } from 'react-bootstrap';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';

import { Folder } from 'react-feather';
import { getRelativeTimeString } from '@/util/datetimeFormat';

export default async function Library() {
  const session = await getSession();
  // console.log("session", session);

  if (!session) {
    redirect('/login');
  }

  const memes = await db(
    `SELECT m.*, u.username, u.id as "userId" FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"`
  );

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <div className={styles.description}>
          <NavigationBar />
          <h1>MemeCache</h1>
          <h2>Library of {session.user.username}</h2>
        </div>
        <div className={styles['memes-masonry']}>
          {memes.reverse().map((meme) => {
            return (
              <div key={meme.id} className={`${styles['meme']}`}>
                <Image
                  className={styles['meme-media']}
                  src={'/api/resource/' + meme.id}
                />
                <div className={styles['meme-body']}>
                  <div className={styles['meme-body-title']}>
                    <Folder size={14} /> {meme.username}'s Memes
                  </div>
                  <div className={styles['meme-body-date']}>
                    {getRelativeTimeString(meme.createdAt)} by{' '}
                    <span className={styles['meme-username']}>
                      {meme.username}
                    </span>
                    {/* {meme.createdAt.toISOString()} */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
