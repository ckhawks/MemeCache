import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import UploadComponent from './UploadComponent';
import { getUserFromAccessToken } from '@/auth/lib';
import { redirect } from 'next/navigation';
import FooterBar from '@/components/FooterBar';

export default async function Upload() {
  const user = await getUserFromAccessToken();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Upload</h1>
            <UploadComponent />
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
