import { db } from '@/db/db';
import styles from '../main.module.scss';
import { Button } from 'react-bootstrap';
import NavigationBar from '@/components/NavigationBar';
import UploadComponent from './UploadComponent';

export default async function Upload() {
  //   const usersResponse = await db(`SELECT * FROM "User"`);

  return (
    <main className={styles.main}>
      <div className={styles.description}>
        <NavigationBar />
        <h1>MemeCache</h1>
        <h2>Upload</h2>
        <UploadComponent />
      </div>
      <Button variant="primary">Primary</Button>{' '}
    </main>
  );
}
