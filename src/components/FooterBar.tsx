'use client';

import Link from 'next/link';
import footerStyles from './FooterBar.module.scss';
import ThemeToggle from './ThemeToggle';

// The first memes went up in 2024.
const SINCE = 2024;

export default function FooterBar() {
  const year = new Date().getFullYear();

  return (
    <footer className={footerStyles['wrapper']}>
      <div className={footerStyles['footer']}>
        <div className={footerStyles['footer-left']}>
          <Link href="/" className={footerStyles['wordmark']}>
            MemeCache
          </Link>
          <span className={footerStyles['credit']}>
            © {SINCE === year ? year : `${SINCE}–${year}`}{' '}
            <a
              href="https://stellaric.pw"
              target="_blank"
              rel="noopener noreferrer"
              className={footerStyles['footer-link']}
            >
              Stellaric
            </a>
          </span>
        </div>
        {/* A Content Policy link goes in this row once the page exists (TODO.md Phase 7). */}
        <div className={footerStyles['footer-right']}>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
