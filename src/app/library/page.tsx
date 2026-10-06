import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'react-feather';
import { countMemes, FEED_PAGE_SIZE, listMemes } from '@/db/queries/memes';
import { parseSearch, searchMemes } from '@/db/queries/search';
import SearchBox from '@/components/SearchBox';

import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';

export const metadata = {
  title: 'Library',
};

export default async function Library(props: {
  searchParams: Promise<{ cursor?: string; q?: string | string[]; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const raw = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim() ?? '';
  const query = parseSearch(raw);
  const searching = query.words.length > 0 || query.tags.length > 0;
  const pageNumber = Number(searchParams.page) || 0;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();

  if (!user) {
    redirect('/login');
  }

  // Library is the memes you saved. Your own uploads are on your profile.
  // A search here looks only through what they saved, ranked as /search ranks.
  const filter = { viewerId: user.id, savedBy: user.id };
  const [page, total, results] = await Promise.all([
    searching ? null : listMemes(filter, searchParams.cursor),
    countMemes(filter),
    searching ? searchMemes(query, { viewerId: user.id, savedBy: user.id, page: pageNumber }) : null,
  ]);
  const memes = results?.memes ?? page?.memes ?? [];
  const everywhere = '/search?' + new URLSearchParams({ q: raw });

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Library</h1>
            {total > 0 && (
              <SearchBox
                action="/library"
                placeholder="Search your library"
                defaultValue={raw}
                className={styles['explore-search']}
              />
            )}
            <div className={styles['feed-header']}>
              <p>
                {results
                  ? `${results.total} of ${total} saved ${total === 1 ? 'meme' : 'memes'}`
                  : `${total} saved ${total === 1 ? 'meme' : 'memes'}`}
              </p>
              <FeedViewToggle view={view} />
            </div>
            {results && (
              <p className={styles['library-expand']}>
                {results.total === 0 ? 'Nothing you saved matches. ' : ''}
                <Link href={everywhere}>
                  <Search size={14} /> Expand search to all of MemeCache
                </Link>
              </p>
            )}
          </div>
          {memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry
                view={view}
                memes={memes}
                currentUserId={user.id}
                search={results ? { query: raw, offset: pageNumber * FEED_PAGE_SIZE } : undefined}
              />
            </div>
          )}
          {total === 0 && (
            <p style={{ color: 'var(--sub-text-color)' }}>
              Nothing saved yet. Use the bookmark on any meme to keep it here. Your own uploads
              are on your profile.
            </p>
          )}
          {results ? (
            <FeedPager basePath="/library" nextPage={results.nextPage} params={{ q: raw }} />
          ) : (
            <FeedPager basePath="/library" nextCursor={page?.nextCursor} />
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
