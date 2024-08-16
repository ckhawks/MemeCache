import { db } from '@/db/db';
import styles from './main.module.scss';
import { Button } from 'react-bootstrap';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await getSession();
  // console.log("session", session);

  if (!session) {
    redirect('/login');
  }

  const usersResponse = await db(`SELECT * FROM "User"`);

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <div className={styles.description}>
          <h1>MemeCache</h1>
          <NavigationBar />
          <p>
            Get started by editing&nbsp;
            <code className={styles.code}>src/app/page.tsx</code>
          </p>
        </div>
        <p>Hello {session.user.username}</p>
        {usersResponse.map((user) => {
          return <div key={user.id}>{user.username}</div>;
        })}
        <Button variant="primary">Primary</Button>{' '}
      </div>
    </main>
  );
}
