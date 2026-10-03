import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireAdmin } from '@/server/requireAdmin';
import { listMemes } from '@/db/queries/memes';
import DesignSystem from './DesignSystem';

export const metadata = {
  title: 'Design system',
};

export default async function DesignSystemPage() {
  const user = await requireAdmin();
  // Real memes, so cards show real media. Their actions are live.
  const { memes } = await listMemes({ viewerId: user.id }, null, 2);

  return (
    <>
      <NavigationBar username={user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to="/admin" text="Admin" />
            <h1>Design system</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Every component in its states. The dark column re-themes its contents with a
              nested <code>data-theme=&quot;dark&quot;</code>. Interactive examples point at
              a meme that does not exist, so clicking them shows the error and rollback
              paths without changing data. The cards at the bottom are real.
            </p>
          </div>
          <DesignSystem memes={memes} userId={user.id} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
