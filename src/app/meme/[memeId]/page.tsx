// app/meme/[memeId]/page.tsx

import { db } from '@/db/db';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { MemeDetailsLarge } from './MemeDetailsLarge';
import MemeTranscriptionEditor from '@/components/MemeTranscriptionEditor';

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
          <MemeTranscriptionEditor
            memeId={params.memeId}
            userId={user?.id || ''}
          />
        </div>
      </main>
      <FooterBar />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: { memeId: string };
}) {
  // Fetch meme details from an API endpoint; adjust URL or logic as needed
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'https://memecache.me'}/api/meme/${
      params.memeId
    }`
  );
  const meme = await res.json();

  const title = meme.cacheName || 'Meme';
  const description = `Check out this meme by ${meme.username || 'unknown'}`;
  const url = `${
    process.env.NEXT_PUBLIC_BASE_URL || 'https://memecache.me'
  }/meme/${meme.id}`;

  if (meme.contentType && meme.contentType.startsWith('video/')) {
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'video.other',
        url,
        siteName: 'MemeCache.me',
        video: {
          url: `/api/resource/${meme.id}`,
          type: meme.contentType,
        },
      },
      twitter: {
        card: 'player',
        title,
        description,
        player: `/api/resource/${meme.id}`,
      },
    };
  } else {
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [
          {
            url: `/api/resource/${meme.id}`,
          },
        ],
        type: 'article',
        url,
        siteName: 'MemeCache.me',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [`/api/resource/${meme.id}`],
      },
    };
  }
}
