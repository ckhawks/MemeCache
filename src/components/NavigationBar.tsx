import Link from 'next/link';
import styles from '../app/main.module.scss';

export default function NavigationBar() {
  return (
    <div className={styles['navigation-bar']}>
      Navigation bar
      <Link href={'/'}>Home</Link>
      <Link href={'/library'}>Library</Link>
      <Link href={'/upload'}>Upload</Link>
      <Link href={'/me'}>Profile</Link>
    </div>
  );
}
