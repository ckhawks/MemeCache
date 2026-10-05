import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { X } from 'react-feather';
import styles from '../main.module.scss';
import s from './Search.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import SearchBox from '@/components/SearchBox';
import FeedViewToggle from '@/components/FeedViewToggle';
import FeedPager from '@/components/FeedPager';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getUserFromAccessToken } from '@/auth/lib';
import { getFeedView } from '@/server/feedView';
import { formatSearch, parseSearch, searchMemes } from '@/db/queries/search';
import { searchTags } from '@/db/queries/tags';
import { FEED_PAGE_SIZE } from '@/db/queries/memes';
import { recordEvent } from '@/db/queries/events';
import { isBot } from '@/server/isBot';
import { existingVisitorKey } from '@/server/visitor';

export async function generateMetadata(props: { searchParams: Promise<{ q?: string }> }) {
  const q = (await props.searchParams).q?.trim();
  return {
    title: q ? `${q} · Search · MemeCache` : 'Search · MemeCache',
  };
}

function searchHref(query: { text: string; tags: string[] }) {
  return '/search?' + new URLSearchParams({ q: formatSearch(query) });
}

// Public, like Explore: visitors can search too.
export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string | string[]; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const raw = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim() ?? '';
  const query = parseSearch(raw);
  const asked = query.words.length > 0 || query.tags.length > 0;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();

  const [results, tags] = await Promise.all([
    searchMemes(query, { viewerId: user?.id, page: Number(searchParams.page) || 0 }),
    // Tags whose names hold the words, offered as filters. Not once filtering already.
    query.text && query.tags.length === 0 ? searchTags(query.text, 6) : Promise.resolve([]),
  ]);
  const suggestions = tags.filter((t) => t.uses > 0);
  const snippets = Object.fromEntries(results.memes.map((m) => [m.id, m.snippet]));
  const page = Number(searchParams.page) || 0;

  // A search event, for what people look for and what finds nothing. Only the first page,
  // so paging through results is one search, and never for bots or the router prefetching
  // a link it has not been asked to follow. Written after the page is sent.
  const requestHeaders = await headers();
  if (
    asked &&
    page === 0 &&
    !requestHeaders.get('next-router-prefetch') &&
    !isBot(requestHeaders.get('user-agent'))
  ) {
    const visitorKey = user ? null : await existingVisitorKey();
    after(() =>
      recordEvent({
        kind: 'search',
        userId: user?.id,
        visitorKey,
        data: {
          query: raw,
          text: query.text,
          tags: query.tags,
          results: results.total,
        },
      })
    );
  }

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Search</h1>
            <SearchBox defaultValue={raw} shortcut autoFocus={!asked} className={s['box']} />

            {(query.tags.length > 0 || suggestions.length > 0) && (
              <div className={s['filters']}>
                {query.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={searchHref({ text: query.text, tags: query.tags.filter((t) => t !== tag) })}
                    className={`${s['filter']} ${s['active']}`}
                    aria-label={`Stop filtering by ${tag}`}
                  >
                    tag: {tag}
                    <X size={12} />
                  </Link>
                ))}
                {suggestions.length > 0 && <span className={s['filters-label']}>Filter by tag</span>}
                {suggestions.map((tag) => (
                  <Link
                    key={tag.id}
                    // Searching "cats" and picking the cats tag means the tag, not the word too.
                    href={searchHref({
                      text: tag.name.toLowerCase() === query.text.toLowerCase() ? '' : query.text,
                      tags: [tag.name],
                    })}
                    className={s['filter']}
                  >
                    {tag.name}
                    <span className={s['uses']}>{tag.uses}</span>
                  </Link>
                ))}
              </div>
            )}

            {asked && (
              <div className={styles['feed-header']}>
                <p>
                  {results.total} {results.total === 1 ? 'result' : 'results'}
                </p>
                <FeedViewToggle view={view} />
              </div>
            )}
          </div>

          {!asked && (
            <p className={s['help']}>
              Type any words you remember from a meme, even part of a word or with a typo, or
              the name of a tag. Add tag:name to see only memes with that tag. On a computer,
              press / on any page to jump to search.
            </p>
          )}
          {asked && results.total === 0 && (
            <p className={s['help']}>
              Nothing matched. Try fewer words, or only the ones you are sure of. Memes whose
              text has not been typed out yet can only be found by their tags.
            </p>
          )}

          <div className={styles['memes-masonry']}>
            <GalleryMasonry
              view={view}
              memes={results.memes}
              currentUserId={user?.id || ''}
              snippets={snippets}
              search={{ query: raw, offset: page * FEED_PAGE_SIZE }}
            />
          </div>
          <FeedPager basePath="/search" nextPage={results.nextPage} params={{ q: raw }} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
