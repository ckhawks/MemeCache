// app/meme/[memeId]/page.tsx

import { db } from '@/db/db';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { GalleryMasonry } from '@/components/GalleryMasonry';

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

export default async function TagDetails({
  params,
}: {
  params: { tagName: string };
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

  // Replace your current tagData query with the following:
const memes = await db(
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
    JOIN "MemeTag" mt ON mt.memeId = m.id
    JOIN "Tag" t ON t.id = mt.tagId
    LEFT JOIN "MemeTagVote" v ON v.memeId = m.id AND v.tagId = t.id
    LEFT JOIN "User" u ON u.id = m."uploaderUserId"
    LEFT JOIN "MemeCache" mc ON mc."memeId" = m.id
    LEFT JOIN "Cache" c ON c.id = mc."cacheId"
    LEFT JOIN "Like" l ON l."memeId" = m.id
    WHERE LOWER(t.name) = LOWER($2)
    GROUP BY m.id, u.username, u.id, c.name
    HAVING COALESCE(SUM(v.vote), 0) >= 1
    ORDER BY m."createdAt" DESC
    `,
    [user?.id, params.tagName]
  );

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/explore'} text={'Back'} />
            <h1>{params.tagName}</h1>
            <p>{memes.length} items</p>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry memes={memes} currentUserId={user?.id || ''} />
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}