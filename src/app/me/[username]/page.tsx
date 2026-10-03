// library/page.tsx

import { getProfile } from '@/db/queries/users';
import { countMemes, listMemes } from '@/db/queries/memes';
import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import FooterBar from '@/components/FooterBar';
import Link from 'next/link';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import FeedPager from '@/components/FeedPager';

export default async function Profile({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { cursor?: string };
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

  const userFromDb = await getProfile(params.username);

  if (!userFromDb) {
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

  const filter = { viewerId: user?.id, uploaderId: userFromDb.id };
  const [page, total] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
  ]);

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
                  alt=""
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

            </div>

            <p>{total} total items</p>
          </div>
          {page.memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry memes={page.memes} currentUserId={user?.id || ''} />
            </div>
          )}
          <FeedPager
            basePath={'/me/' + encodeURIComponent(userFromDb.username)}
            nextCursor={page.nextCursor}
          />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
