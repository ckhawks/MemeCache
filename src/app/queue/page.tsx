import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import { isModerator } from '@/auth/role';
import { QUEUE_TASKS, type QueueTask } from '@/constants/queue';
import QueueClient from './QueueClient';

// One meme at a time that needs something: its text typed out or checked, or its tags
// added or voted on. The work happens in QueueClient; this page only checks the session.
export default async function Queue(props: { searchParams: Promise<{ task?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getUserFromAccessToken();
  if (!user) {
    redirect('/login?next=/queue');
  }
  const task = QUEUE_TASKS.includes(searchParams.task as QueueTask)
    ? (searchParams.task as QueueTask)
    : 'transcription';

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Queue</h1>
          </div>
          <QueueClient initialTask={task} userId={user.id} canModerate={isModerator(user)} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
