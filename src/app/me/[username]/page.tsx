import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from '../../main.module.scss';
import p from './Profile.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import FeedViewToggle from '@/components/FeedViewToggle';
import FeedPager from '@/components/FeedPager';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getUserFromAccessToken } from '@/auth/lib';
import { isAdmin } from '@/auth/role';
import { getKarma, getProfile, getProfileStats } from '@/db/queries/users';
import { countMemes, listMemes } from '@/db/queries/memes';
import { getFeedView } from '@/server/feedView';

const ROLE_BADGES: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
};

export default async function Profile(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  const view = await getFeedView();

  if (!params.username) {
    notFound();
  }
  const profile = await getProfile(params.username);
  if (!profile) {
    notFound();
  }

  const filter = { viewerId: user?.id, uploaderId: profile.id };
  const [page, total, stats, karma] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
    getProfileStats(profile.id),
    getKarma(profile.id),
  ]);

  const isCurrentUser = user?.id === profile.id;
  const badge = ROLE_BADGES[stats.role];

  const statItems = [
    { value: karma, label: 'Karma' },
    { value: stats.uploads, label: 'Uploads' },
    { value: stats.likesReceived, label: 'Likes received' },
    { value: stats.tagsAdded, label: 'Tags added' },
    { value: stats.transcriptions, label: 'Transcriptions' },
  ];

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <section className={p.header}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={'/api/resource/avatar/' + encodeURIComponent(profile.username)}
              alt={`${profile.username}'s avatar`}
              width={96}
              height={96}
              className={p.avatar}
            />
            <div className={p.identity}>
              <div className={p.nameRow}>
                <h1 className={p.name}>{profile.username}</h1>
                {badge && <span className={p.badge}>{badge}</span>}
              </div>
              {stats.memberSince && (
                <div className={p.since}>
                  Member since{' '}
                  {new Date(stats.memberSince).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              )}
            </div>
            <dl className={p.stats}>
              {statItems.map((item) => (
                <div key={item.label} className={p.stat}>
                  <dt className={p.statLabel}>{item.label}</dt>
                  <dd className={p.statValue}>{item.value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {isCurrentUser && (
              <div className={p.actions}>
                <Link
                  href={'/me/' + encodeURIComponent(profile.username) + '/edit'}
                  className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
                >
                  Edit profile
                </Link>
                {user && isAdmin(user) && (
                  <Link
                    href="/admin"
                    className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
                  >
                    Admin
                  </Link>
                )}
                {/* Phones have no logout in the top bar, so it lives here too. */}
                <Link
                  prefetch={false}
                  href="/api/logout"
                  className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
                >
                  Log out
                </Link>
              </div>
            )}
          </section>

          <div className={styles['feed-header']}>
            <h2 className={p.sectionTitle}>
              Uploads <span className={p.count}>{total.toLocaleString()}</span>
            </h2>
            <FeedViewToggle view={view} />
          </div>
          {page.memes.length > 0 && (
            <div className={styles['memes-masonry']}>
              <GalleryMasonry view={view} memes={page.memes} currentUserId={user?.id || ''} />
            </div>
          )}
          {total === 0 && (
            <p style={{ color: 'var(--sub-text-color)' }}>
              {isCurrentUser ? (
                <>
                  Nothing uploaded yet. <Link href="/upload">Upload your first meme</Link>.
                </>
              ) : (
                'No memes uploaded yet.'
              )}
            </p>
          )}
          <FeedPager
            basePath={'/me/' + encodeURIComponent(profile.username)}
            nextCursor={page.nextCursor}
          />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
