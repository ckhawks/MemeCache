import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { countMemes, listMemes, listMemesOrdered, type FeedSort as Sort } from '@/db/queries/memes';
import FeedSort from '@/components/FeedSort';
import { randomBytes } from 'crypto';

import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';

export default async function Explore(props: {
  searchParams: Promise<{ cursor?: string; sort?: string; seed?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sort: Sort = searchParams.sort === 'top' || searchParams.sort === 'random' ? searchParams.sort : 'new';
  // A shuffle with no seed in the URL gets one, so this visit has a stable order to page through.
  const seed = searchParams.seed?.slice(0, 16) || randomBytes(4).toString('hex');
  const freshSeed = randomBytes(4).toString('hex');
  const user = await getUserFromAccessToken();
  const view = await getFeedView();

  const filter = { viewerId: user?.id };
  const [page, total] = await Promise.all([
    sort === 'new'
      ? listMemes(filter, searchParams.cursor)
      : listMemesOrdered(filter, sort, { page: Number(searchParams.page) || 0, seed }),
    countMemes(filter),
  ]);

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Explore</h1>
            <div className={styles['feed-header']}>
              <p>{total} items</p>
              <div className={styles['feed-controls']}>
                <FeedSort basePath="/explore" sort={sort} freshSeed={freshSeed} />
                <FeedViewToggle view={view} />
              </div>
            </div>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry view={view}
              memes={page.memes}
              currentUserId={user?.id || ''}
            />
          </div>
          {total === 0 && <p style={{ color: 'var(--sub-text-color)' }}>No memes yet. Be the first to upload one.</p>}
          {'nextCursor' in page ? (
            <FeedPager basePath="/explore" nextCursor={page.nextCursor} />
          ) : (
            <FeedPager basePath="/explore" nextPage={page.nextPage} sort={sort} seed={sort === 'random' ? seed : undefined} />
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
