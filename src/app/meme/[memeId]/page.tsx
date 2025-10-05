// app/meme/[memeId]/page.tsx

import { db } from '@/db/db';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import MemeMediaRenderer from '@/components/MemeMediaRenderer';
import Link from 'next/link';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import LikeButton from '@/components/LikeButton';
import { Folder } from 'react-feather';
import {
  getRelativeTimeString,
  getServerSideRelativeTime,
} from '@/util/datetimeFormat';
import { MemeDetailsLarge } from './MemeDetailsLarge';

interface Meme {
  id: string;
  contentType: string;
  uploaderUserId: string;
  username: string;
  userId: string;
  cacheName: string;
  hasLiked: boolean;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
}

export default async function MemeDetails({
  params,
}: {
  params: { memeId: string };
}) {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  // const memes = await db(
  //   `SELECT m.*, u.username, u.id as "userId", c.name as "cacheName"  FROM "Meme" m
  //   LEFT JOIN "User" u ON u.id = m."uploaderUserId"
  //   LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
  //   LEFT JOIN "Cache" c ON c.id = mc."cacheId"
  //   ORDER BY "createdAt" ASC`
  // );

  console.log();

  const memeData = await db(
    `
    SELECT 
      m.*, 
      u.username, 
      u.id as "userId", 
      c.name as "cacheName",
      COUNT(l.id) as "likeCount",
      CASE 
        WHEN EXISTS (
          SELECT 1 
          FROM "Like" l2 
          WHERE l2."memeId" = m.id AND l2."userId" = $1
        ) THEN true 
        ELSE false 
      END as "hasLiked"
    FROM "Meme" m
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    LEFT JOIN "Like" l ON l."memeId" = m.id
    WHERE m.id = $2
    GROUP BY m.id, u.username, u.id, c.name
    ORDER BY m."createdAt" ASC
    `,
    [user?.id, params.memeId]
  );

  const meme: Meme = memeData[0] as any;

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/explore'} text={'Back'} />
            {/* <h1>Explore</h1> */}
            {/* <p>{memes.length} items</p> */}
          </div>
          <MemeDetailsLarge meme={meme} user={user} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
