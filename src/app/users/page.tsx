import Link from 'next/link';
import { ChevronRight } from 'react-feather';
import styles from '../main.module.scss';
import b from '../tags/Browse.module.scss';
import s from '@/components/FeedSort.module.scss';
import p from './People.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import FollowButton from '@/components/FollowButton';
import WarningCover from '@/components/WarningCover';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import { getUserFromAccessToken } from '@/auth/lib';
import { displayUsername } from '@/auth/username';
import { avatarUrl } from '@/util/avatarUrl';
import { isPeopleSort, listPeople, type PeopleSort } from '@/db/queries/userLists';

export const metadata = {
  title: 'Browse people',
};

const SORTS: { sort: PeopleSort; label: string }[] = [
  { sort: 'karma', label: 'Most karma' },
  { sort: 'followers', label: 'Most followers' },
  { sort: 'new', label: 'Newest' },
  { sort: 'active', label: 'Active lately' },
];

function sortHref(sort: PeopleSort, page = 0) {
  const search = new URLSearchParams();
  if (sort !== 'karma') {
    search.set('sort', sort);
  }
  if (page > 0) {
    search.set('page', String(page));
  }
  const query = search.toString();
  return '/users' + (query ? '?' + query : '');
}

// Browse people: everyone with an account, in rows like Browse tags, each with a strip of
// their most-liked uploads. Open to visitors; members get Follow on everyone but themselves.
// Deleted accounts are left out, and so are memes with a tag the viewer muted.
export default async function BrowsePeople(props: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const sort = isPeopleSort(searchParams.sort) ? searchParams.sort : 'karma';
  const page = Math.max(0, Math.floor(Number(searchParams.page) || 0));
  const user = await getUserFromAccessToken();
  const { rows, nextPage } = await listPeople({ sort, page, viewerId: user?.id });

  const secondary = `${styles.button} ${styles['button-secondary']} ${styles['button-small']}`;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Browse people</h1>
            <div className={b.intro}>
              <p>Everyone on MemeCache. Follow someone and their uploads come first under For you on Explore.</p>
              <nav className={`${s.sort} ${p.sorts}`} aria-label="Sort">
                {SORTS.map((option) => (
                  <Link
                    key={option.sort}
                    href={sortHref(option.sort)}
                    className={`${s.option} ${sort === option.sort ? s.active : ''}`}
                    aria-current={sort === option.sort ? 'page' : undefined}
                  >
                    {option.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          {rows.length === 0 && <p className={b.empty}>{page > 0 ? 'Nobody else.' : 'Nobody here yet.'}</p>}

          <div className={b.rows}>
            {rows.map((row) => {
              const href = '/me/' + encodeURIComponent(row.username);
              const name = displayUsername(row.username);
              return (
                <section key={row.id} className={b.row}>
                  <div className={b.rowHeader}>
                    <Link href={href} className={p.person}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarUrl(row.username, row.avatarKey)} alt="" width={36} height={36} className={p.avatar} />
                      <span className={b.tagName}>{name}</span>
                    </Link>
                    <span className={b.uses}>
                      {row.karma.toLocaleString()} karma · {row.followers.toLocaleString()} {row.followers === 1 ? 'follower' : 'followers'} · {row.uploads.toLocaleString()} {row.uploads === 1 ? 'upload' : 'uploads'}
                    </span>
                    {user && user.id !== row.id && (
                      <FollowButton userId={row.id} username={name} following={row.following} />
                    )}
                    <Link href={href} className={b.seeAll}>
                      Profile <ChevronRight size={14} />
                    </Link>
                  </div>
                  {row.memes.length > 0 ? (
                    <div className={b.strip}>
                      {row.memes.map((meme) => (
                        <Link key={meme.id} href={`/meme/${meme.slug}`} className={b.thumb}>
                          {/* Warned memes stay blurred here; the click opens the meme page. */}
                          <WarningCover compact warnings={meme.warnings} className={b.thumbCover}>
                            {supportedVideoTypes.includes(meme.contentType) ? (
                              // The first frame, as on feed cards.
                              <video src={`/api/resource/${meme.id}#t=0.1`} preload="metadata" muted />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/resource/${meme.id}`} alt="" loading="lazy" />
                            )}
                          </WarningCover>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className={p.none}>No uploads to show.</p>
                  )}
                </section>
              );
            })}
          </div>

          {nextPage !== null && (
            <div className={b.more}>
              <Link href={sortHref(sort, nextPage)} className={secondary}>
                More people
              </Link>
            </div>
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
