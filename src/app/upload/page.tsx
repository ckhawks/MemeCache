import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import UploadComponent from './UploadComponent';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';
import { db } from '@/db/db';

export default async function Upload() {
  const session = await getSession();
  //   const usersResponse = await db(`SELECT * FROM "User"`);

  if (!session) {
    redirect('/login');
  }

  const caches = await db(
    `SELECT * FROM "Cache" c
    WHERE "ownerUserId" = $1`,
    [session.user.id]
  );

  return (
    <>
      <NavigationBar username={session.user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Upload</h1>
            <UploadComponent userId={session.user.id} caches={caches as any} />
          </div>
          {/* <Button variant="primary">Primary</Button>{' '} */}
        </div>
      </main>
    </>
  );
}
