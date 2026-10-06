import { redirect } from 'next/navigation';
import styles from '../main.module.scss';
import u from './Upload.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { getUserFromAccessToken } from '@/auth/lib';
import UploadComponent from './UploadComponent';

export const metadata = {
  title: 'Upload',
};

export default async function Upload() {
  if (!(await getUserFromAccessToken())) {
    redirect('/login');
  }

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          {/* One focused task, so one centered column rather than the left-aligned page layout. */}
          <div className={u.page}>
            <header className={u.pageHeader}>
              <h1 className={u.pageTitle}>Upload a meme</h1>
              <p className={u.pageSubtitle}>
                Add it to MemeCache so you can find it and send it later.
              </p>
            </header>
            <UploadComponent />
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
