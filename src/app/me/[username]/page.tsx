import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import styles from '../../main.module.scss';
import p from './Profile.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import FeedViewToggle from '@/components/FeedViewToggle';
import FeedPager from '@/components/FeedPager';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getUserFromAccessToken } from '@/auth/lib';
import { avatarUrl } from '@/util/avatarUrl';
import { getKarmaBreakdown, getProfile, getProfileStats, getTrust } from '@/db/queries/users';
import { isAdmin, isModerator } from '@/auth/role';
import TrustOverride from './TrustOverride';
import AdminRename from './AdminRename';
import { findRenamedUsername, listUsernameHistory } from '@/db/queries/usernames';
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
    // Someone's old name, from before a rename: send old links to where they are now.
    const renamed = await findRenamedUsername(params.username);
    if (renamed) {
      permanentRedirect('/me/' + encodeURIComponent(renamed));
    }
    notFound();
  }

  const filter = { viewerId: user?.id, uploaderId: profile.id };
  const [page, total, stats, karma, trust, nameHistory] = await Promise.all([
    listMemes(filter, searchParams.cursor),
    countMemes(filter),
    getProfileStats(profile.id),
    getKarmaBreakdown(profile.id),
    getTrust(profile.id),
    listUsernameHistory(profile.id),
  ]);

  const isCurrentUser = user?.id === profile.id;
  // A hold is shown to the person it applies to and to moderators, never to everyone.
  const showTrust = trust.held && (isCurrentUser || (!!user && isModerator(user)));
  const badge = ROLE_BADGES[stats.role];

  const statItems = [
    { value: karma.post + karma.curation, label: 'Karma' },
    // Post karma is exactly the likes others gave their uploads.
    { value: karma.post, label: 'Post karma' },
    { value: karma.curation, label: 'Curation karma' },
    { value: stats.uploads, label: 'Uploads' },
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
              src={avatarUrl(profile.username, profile.avatarS3Key)}
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
              {/* Closed until asked for: old names are there to check, not to show off. */}
              {nameHistory.length > 0 && (
                <details className={p.nameHistory}>
                  <summary>Name history</summary>
                  <ul>
                    {nameHistory.map((change) => (
                      <li key={new Date(change.changedAt).toISOString() + change.oldUsername}>
                        Previously known as <strong>{change.oldUsername}</strong>, until{' '}
                        {new Date(change.changedAt).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </li>
                    ))}
                  </ul>
                </details>
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

          {showTrust && (
            <p className={p.trustNote}>
              {isCurrentUser ? 'Your' : 'Their'} new tags and transcriptions wait for someone to
              confirm them before they show, and {isCurrentUser ? 'your' : 'their'} votes and
              reviews do not count for now.{' '}
              {trust.override === 'held'
                ? 'An admin set this.'
                : `${trust.approved} of ${trust.approved + trust.rejected} judged contributions were approved; this lifts once more than half are.`}
            </p>
          )}
          {user && isAdmin(user) && !isCurrentUser && (
            <>
              <TrustOverride userId={profile.id} override={trust.override} />
              <AdminRename userId={profile.id} username={profile.username} />
            </>
          )}

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
