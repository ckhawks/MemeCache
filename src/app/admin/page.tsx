import Link from 'next/link';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { requireAdmin } from '@/server/requireAdmin';
import { countOpenReports } from '@/db/queries/reports';
import { getActivityNumbers, listFailedSearches } from '@/db/queries/events';

export const metadata = {
  title: 'Admin',
};

const TOOLS = [
  {
    href: '/admin/design',
    title: 'Design system',
    description: 'Every component, color and text style in one place, in light and dark.',
  },
  {
    href: '/admin/reports',
    title: 'Reports',
    description: 'Memes members reported, to dismiss or delete. Moderators can use this one too.',
  },
  {
    href: '/admin/users',
    title: 'Users',
    description: 'Every account with its karma, followers, trust and invite code, sortable, with moderation on each row.',
  },
  {
    href: '/admin/invites',
    title: 'Invite codes',
    description: 'Make and turn off the codes people sign up with, and see who used each.',
  },
  {
    href: '/admin/log',
    title: 'Moderation log',
    description: "Everything moderators and admins did to other people's memes, comments, tags and accounts.",
  },
];

const tile = {
  padding: '12px 16px',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
};

const tileNumber = {
  fontSize: '24px',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
} as const;

const tileLabel = {
  color: 'var(--sub-text-color)',
  fontSize: '14px',
};

export default async function Admin() {
  const user = await requireAdmin();
  const [openReports, activity, failedSearches] = await Promise.all([
    countOpenReports(),
    getActivityNumbers(),
    listFailedSearches(10),
  ]);
  // From the event table (migration 017).
  const numbers = [
    { label: 'Active members, last 7 days', value: activity.activeWeek },
    { label: 'Active members, last 30 days', value: activity.activeMonth },
    { label: 'Searches, last 7 days', value: activity.searchesWeek },
    { label: 'Sends, last 7 days', value: activity.sendsWeek },
    { label: 'Shared or link copied, last 7 days', value: activity.sharesWeek + activity.copiesWeek },
    { label: 'Downloads, last 7 days', value: activity.downloadsWeek },
  ];
  // Shown after a tool's title when there is something waiting in it.
  const badges: Record<string, string> = {
    '/admin/reports': openReports.reports > 0 ? `${openReports.reports} open` : '',
  };

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Admin</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>Tools for admins. Nobody else can see these pages.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px' }}>
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                style={{
                  display: 'block',
                  padding: '16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  color: 'var(--text-color)',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {tool.title}
                  {badges[tool.href] && (
                    <span style={{ marginLeft: '8px', color: 'var(--danger-color)', fontSize: '14px' }}>{badges[tool.href]}</span>
                  )}
                </div>
                <div style={{ color: 'var(--sub-text-color)', fontSize: '14px' }}>{tool.description}</div>
              </Link>
            ))}
          </div>

          <h2 style={{ fontSize: '20px', marginTop: '32px' }}>Activity</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            {numbers.map((n) => (
              <div key={n.label} style={tile}>
                <div style={tileNumber}>{n.value.toLocaleString()}</div>
                <div style={tileLabel}>{n.label}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '20px', marginTop: '32px' }}>Searches that found nothing, last 7 days</h2>
          {failedSearches.length === 0 ? (
            <p style={{ color: 'var(--sub-text-color)' }}>None.</p>
          ) : (
            <ol style={{ paddingLeft: '20px', paddingBottom: '40px' }}>
              {failedSearches.map((search) => (
                // Not a link: opening one would log another search that finds nothing.
                <li key={search.query}>
                  {search.query}
                  <span style={{ color: 'var(--sub-text-color)' }}> {search.count}x</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
