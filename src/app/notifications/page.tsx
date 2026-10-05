import { redirect } from 'next/navigation';
import styles from '../main.module.scss';
import notificationStyles from '@/components/Notifications.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import NotificationList from '@/components/NotificationList';
import { getUserFromAccessToken } from '@/auth/lib';
import { listNotifications } from '@/db/queries/notifications';
import MarkNotificationsRead from './MarkNotificationsRead';

export const metadata = {
  title: 'Notifications',
};

export default async function Notifications() {
  const user = await getUserFromAccessToken();
  if (!user) {
    redirect('/login?next=' + encodeURIComponent('/notifications'));
  }

  const groups = await listNotifications(user.id, 100);
  const newest = groups.reduce((max, g) => Math.max(max, Number(g.id)), 0);

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Notifications</h1>
          </div>
          {groups.length === 0 ? (
            <p style={{ color: 'var(--sub-text-color)' }}>
              Nothing yet. When someone likes, tags or transcribes your memes, or reviews a tag or transcription you added, it shows up here.
            </p>
          ) : (
            <div className={notificationStyles['page-list']}>
              <NotificationList groups={groups} />
            </div>
          )}
          {groups.some((g) => g.unread) && <MarkNotificationsRead throughId={String(newest)} />}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
