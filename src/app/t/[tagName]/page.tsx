import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import FeedPager from '@/components/FeedPager';
import { countMemes, listMemes } from '@/db/queries/memes';

export default async function TagDetails(props: {
  params: Promise<{ tagName: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();
  // Dynamic segments arrive still percent-encoded ("dog%20pile").
  let tagName = params.tagName;
  try {
    tagName = decodeURIComponent(params.tagName);
  } catch {
    // A literal % that is not an escape. Use the segment as-is.
  }

  // Memes carrying the tag with a net score of at least 1.
  const filter = { viewerId: user?.id, tagName };
  const [page, total] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
  ]);

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to={'/explore'} text={'Back'} />
            <h1>{tagName}</h1>
            <div className={styles['feed-header']}>
              <p>{total} items</p>
              <FeedViewToggle view={view} />
            </div>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry view={view}
              memes={page.memes}
              currentUserId={user?.id || ''}
            />
          </div>
          {total === 0 && <p style={{ color: 'var(--sub-text-color)' }}>No memes carry this tag yet.</p>}
          <FeedPager
            basePath={`/t/${encodeURIComponent(tagName)}`}
            nextCursor={page.nextCursor}
          />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
