import Link from 'next/link';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { requireAdmin } from '@/server/requireAdmin';
import { countOpenReports } from '@/db/queries/reports';

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
    href: '/admin/invites',
    title: 'Invite codes',
    description: 'Make and turn off the codes people sign up with, and see who used each.',
  },
];

export default async function Admin() {
  const user = await requireAdmin();
  const openReports = await countOpenReports();
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
        </div>
      </main>
      <FooterBar />
    </>
  );
}
