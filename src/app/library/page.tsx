import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import { countMemes, listMemes } from '@/db/queries/memes';

import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';

export default async function Library(props: { searchParams: Promise<{ cursor?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();

  if (!user) {
    redirect('/login');
  }

  // Library is the memes you saved. Your own uploads are on your profile.
  const filter = { viewerId: user.id, savedBy: user.id };
  const [page, total] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
  ]);

  return (
    <>
      <NavigationBar username={user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Library</h1>
            <div className={styles['feed-header']}>
              <p>
                {total} saved {total === 1 ? 'meme' : 'memes'}
              </p>
              <FeedViewToggle view={view} />
            </div>
          </div>
          {page.memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry view={view} memes={page.memes} currentUserId={user.id} />
            </div>
          )}
          {total === 0 && (
            <p style={{ color: 'var(--sub-text-color)' }}>
              Nothing saved yet. Use the bookmark on any meme to keep it here. Your own uploads
              are on your profile.
            </p>
          )}
          <FeedPager basePath="/library" nextCursor={page.nextCursor} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
