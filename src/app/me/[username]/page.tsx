// library/page.tsx

import { getProfile } from '@/db/queries/users';
import { countMemes, listMemes } from '@/db/queries/memes';
import styles from '../../main.module.scss';
import { notFound } from 'next/navigation';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import FooterBar from '@/components/FooterBar';
import Link from 'next/link';
import { isAdmin } from '@/auth/role';
import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import FeedPager from '@/components/FeedPager';

export default async function Profile(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  if (!params.username) {
    notFound();
  }

  const userFromDb = await getProfile(params.username);

  if (!userFromDb) {
    notFound();
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link
                      href={'/me/' + user?.username + '/edit'}
                      className={`${styles['button']} ${styles['button-secondary']}`}
                    >
                      Edit profile
                    </Link>
                    {user && isAdmin(user) && (
                      <Link
                        href="/admin"
                        className={`${styles['button']} ${styles['button-secondary']}`}
                      >
                        Admin
                      </Link>
                    )}
                    {/* Phones have no logout in the top bar, so it lives here too. */}
                    <Link
                      prefetch={false}
                      href={'/api/logout'}
                      className={`${styles['button']} ${styles['button-secondary']}`}
                    >
                      Log out
                    </Link>
                  </div>
                )}
              </div>

            </div>

            <div className={styles['feed-header']}>
              <p>
                {total} {total === 1 ? 'upload' : 'uploads'}
              </p>
              <FeedViewToggle view={view} />
            </div>
          </div>
          {page.memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry view={view}
              memes={page.memes}
              currentUserId={user?.id || ''}
            />
            </div>
          )}
          {total === 0 && <p style={{ color: 'var(--sub-text-color)' }}>No memes uploaded yet.</p>}
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
