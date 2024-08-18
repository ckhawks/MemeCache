'use client';

import Link from 'next/link';
import styles from '../app/main.module.scss';
import navStyles from './NavigationBar.module.scss';
import { usePathname } from 'next/navigation';
import { LogOut, User } from 'react-feather';

export default function NavigationBar(props: { username: string }) {
  const pathname = usePathname();
  // return <p>Current pathname: {pathname}</p>;
  // console.log(pathname);

  return (
    <div className={navStyles['wrapper']}>
      <div className={navStyles['navbar']}>
        <div className={navStyles['navbar-left']}>
          <Link href={'/'} className={navStyles['logo']}>
            <h5>MemeCache</h5>
          </Link>
        </div>

        <div className={navStyles['navbar-links']}>
          <Link
            href={'/'}
            className={`
              ${navStyles['navbar-link']}
              ${pathname === '/' ? navStyles['active'] : ''}
            `}
          >
            Home
          </Link>
          <Link
            href={'/explore'}
            className={`
              ${navStyles['navbar-link']}
              ${pathname === '/explore' ? navStyles['active'] : ''}
            `}
          >
            Explore
          </Link>
          <Link
            href={'/library'}
            className={`
              ${navStyles['navbar-link']}
              ${pathname === '/library' ? navStyles['active'] : ''}
            `}
          >
            Library
          </Link>
          <Link
            href={'/upload'}
            className={`
              ${navStyles['navbar-link']}
              ${pathname === '/upload' ? navStyles['active'] : ''}
            `}
          >
            Upload
          </Link>
          <Link
            href={'/me/' + props.username}
            className={`
              ${navStyles['navbar-link']}
              ${pathname === '/me/' + props.username ? navStyles['active'] : ''}
            `}
          >
            Profile
          </Link>
        </div>
        <div className={navStyles['navbar-right']}>
          <Link
            href={'/logout'}
            className={`${styles['button']} ${styles['button-small']}`}
          >
            Logout <LogOut size={14} />
          </Link>
          {props.username && (
            <Link
              href={'/me/' + props.username}
              style={{ textDecoration: 'none', color: 'unset' }}
              className={navStyles['navbar-right-user']}
            >
              <User size={14} />
              {props.username}
            </Link>
          )}
          {!props.username && (
            <Link
              href={'/login'}
              className={`${styles['button']} ${styles['button-small']}`}
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
