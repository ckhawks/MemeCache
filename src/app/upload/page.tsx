import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import UploadComponent from './UploadComponent';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import { db } from '@/db/db';

export default async function Upload() {
  const user = await getUserFromAccessToken();
  //   const usersResponse = await db(`SELECT * FROM "User"`);

  if (!user) {
    redirect('/login');
  }

  const caches = await db(
    `SELECT * FROM "Cache" c
    WHERE "ownerUserId" = $1`,
    [user.id]
  );

  return (
    <>
      <NavigationBar username={user?.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Upload</h1>
            <UploadComponent userId={user?.id} caches={caches as any} />
          </div>
          {/* <Button variant="primary">Primary</Button>{' '} */}
        </div>
      </main>
    </>
  );
}
