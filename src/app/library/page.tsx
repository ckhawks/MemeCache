import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import { countMemes, listMemes } from '@/db/queries/memes';

import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';

export default async function Library(props: { searchParams: Promise<{ cursor?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();

  if (!user) {
    redirect('/login');
  }

  const filter = { viewerId: user.id, uploaderId: user.id };
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
            <h1>Library of {user.username}</h1>
            <p>{total} items</p>
          </div>
          {page.memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry memes={page.memes} currentUserId={user.id} />
            </div>
          )}
          {total === 0 && <p>No memes found.</p>}
          <FeedPager basePath="/library" nextCursor={page.nextCursor} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
