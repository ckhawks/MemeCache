'use client';

import Link from 'next/link';
import styles from '../app/main.module.scss';
import footerStyles from './FooterBar.module.scss';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function FooterBar() {
  const pathname = usePathname();
  // return <p>Current pathname: {pathname}</p>;
  // console.log(pathname);

  return (
    <div className={footerStyles['wrapper']}>
      <div className={footerStyles['footer']}>
        <div className={footerStyles['footer-left']}>
          Stellaric — © {new Date().getFullYear()}
        </div>

        <div className={footerStyles['footer-center']}>
          <Link
            href={'/'}
            className={`
              ${footerStyles['footer-link']}
              ${pathname === '/' ? footerStyles['active'] : ''}
            `}
          >
            Content Policy
          </Link>
        </div>
        <div className={footerStyles['footer-right']}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

// TODO make footer sticky
