import Link from 'next/link';
import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { requireAdmin } from '@/server/requireAdmin';

const TOOLS = [
  {
    href: '/admin/design',
    title: 'Design system',
    description: 'Every component, color and text style in one place, in light and dark.',
  },
];

export default async function Admin() {
  const user = await requireAdmin();

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
                <div style={{ fontWeight: 600 }}>{tool.title}</div>
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
