import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { countMemes, listMemes } from '@/db/queries/memes';

import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';

export default async function Explore(props: { searchParams: Promise<{ cursor?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();

  const filter = { viewerId: user?.id };
  const [page, total] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
  ]);

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Explore</h1>
            <p>{total} items</p>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry
              memes={page.memes}
              currentUserId={user?.id || ''}
            />
          </div>
          {total === 0 && <p style={{ color: 'var(--sub-text-color)' }}>No memes yet. Be the first to upload one.</p>}
          <FeedPager basePath="/explore" nextCursor={page.nextCursor} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
