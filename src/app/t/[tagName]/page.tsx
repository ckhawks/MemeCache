import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
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
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to={'/explore'} text={'Back'} />
            <h1>{tagName}</h1>
            <p>{total} items</p>
          </div>
          <div className={styles['memes-masonry']}>
            <GalleryMasonry
              memes={page.memes}
              currentUserId={user?.id || ''}
            />
          </div>
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
