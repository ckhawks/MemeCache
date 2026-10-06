import Link from 'next/link';
import { Hash, Users } from 'react-feather';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import {
  countMemes,
  listForYou,
  listMemes,
  listMemesOrdered,
  type FeedSort as Sort,
  type ForYouCard,
} from '@/db/queries/memes';
import { listTagPreferences } from '@/db/queries/tagPreferences';
import { followsAnyone } from '@/db/queries/follows';
import type { FeedReasons } from '@/components/FeedReason';
import FeedSort from '@/components/FeedSort';
import { randomBytes } from 'crypto';

import FeedViewToggle from '@/components/FeedViewToggle';
import { getFeedView } from '@/server/feedView';
import { GalleryMasonry } from '../../components/GalleryMasonry';
import FooterBar from '@/components/FooterBar';
import FeedPager from '@/components/FeedPager';
import SearchBox from '@/components/SearchBox';

export const metadata = {
  title: 'Explore',
};

export default async function Explore(props: {
  searchParams: Promise<{ cursor?: string; sort?: string; seed?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  // For you needs someone to be for. A visitor with the link gets Newest.
  const sort: Sort =
    searchParams.sort === 'top' || searchParams.sort === 'random' || (searchParams.sort === 'foryou' && user)
      ? searchParams.sort
      : 'new';
  // A shuffle with no seed in the URL gets one, so this visit has a stable order to page through.
  const seed = searchParams.seed?.slice(0, 16) || randomBytes(4).toString('hex');
  const freshSeed = randomBytes(4).toString('hex');
  const view = await getFeedView();
  const pageNumber = Number(searchParams.page) || 0;

  // Every sort leaves out memes carrying a tag the viewer muted, and so does the count.
  const filter = { viewerId: user?.id, hideMuted: true };
  const [page, total, preferences, followsPeople] = await Promise.all([
    sort === 'new'
      ? listMemes(filter, searchParams.cursor)
      : sort === 'foryou'
        ? listForYou(user!.id, { page: pageNumber })
        : listMemesOrdered(filter, sort, { page: pageNumber, seed }),
    countMemes(filter),
    sort === 'foryou' ? listTagPreferences(user!.id) : [],
    sort === 'foryou' ? followsAnyone(user!.id) : false,
  ]);
  const followsAny = followsPeople || preferences.some((p) => p.kind === 'follow');
  // For you shows why each meme is where it is. With no tag or person followed every line
  // would say the same thing, so there are none.
  const reasons: Record<string, FeedReasons> | undefined =
    sort === 'foryou' && followsAny
      ? Object.fromEntries(
          page.memes.map((m) => [
            m.id,
            'followedTags' in m
              ? {
                  followedTags: (m as ForYouCard).followedTags,
                  followedUsers: (m as ForYouCard).followedUsers,
                }
              : {
                  followedTags: [],
                  followedUsers: [],
                },
          ])
        )
      : undefined;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Explore</h1>
            <SearchBox shortcut quietShortcut className={styles['explore-search']} />
            <div className={styles['feed-header']}>
              <p>{total} items</p>
              <div className={styles['feed-controls']}>
                <Link
                  href="/tags"
                  className={`${styles.button} ${styles['button-secondary']} ${styles['button-small']}`}
                >
                  <Hash size={14} /> Browse tags
                </Link>
                <Link
                  href="/users"
                  className={`${styles.button} ${styles['button-secondary']} ${styles['button-small']}`}
                >
                  <Users size={14} /> Browse people
                </Link>
                <FeedSort basePath="/explore" sort={sort} freshSeed={freshSeed} signedIn={!!user} />
                <FeedViewToggle view={view} />
              </div>
            </div>
          </div>
          {sort === 'foryou' && !followsAny && (
            <div className={styles['feed-prompt']}>
              <p>
                You do not follow any tags or people yet. Follow a few tags on <Link href="/tags">Browse tags</Link> or on any tag&apos;s page, or follow people from their profiles or <Link href="/users">Browse people</Link>, and their memes will come first here. Until then it shows everything.
              </p>
            </div>
          )}
          <div className={styles['memes-masonry']}>
            <GalleryMasonry view={view}
              memes={page.memes}
              currentUserId={user?.id || ''}
              reasons={reasons}
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
