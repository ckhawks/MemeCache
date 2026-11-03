import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireAdmin } from '@/server/requireAdmin';
import LiveDashboard from './LiveDashboard';

export const metadata = {
  title: 'Live',
};

// Who is on the site now, what people are doing, and page views over the last day.
// Admins only. The data comes from GET /api/admin/live, polled by LiveDashboard.
export default async function Live() {
  await requireAdmin();

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to="/admin" text="Admin" />
            <h1>Live</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Who has the site open right now, and what everyone has been doing. Updates every few seconds.
            </p>
          </div>
          <LiveDashboard />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
