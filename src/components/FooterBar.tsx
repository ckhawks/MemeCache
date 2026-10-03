'use client';

import styles from '../app/main.module.scss';
import footerStyles from './FooterBar.module.scss';
import ThemeToggle from './ThemeToggle';

export default function FooterBar() {

  return (
    <div className={footerStyles['wrapper']}>
      <div className={footerStyles['footer']}>
        <div className={footerStyles['footer-left']}>
          Stellaric — © {new Date().getFullYear()}
        </div>

        <div className={footerStyles['footer-center']}>
          {/* A Content Policy link goes here once the page exists (TODO.md Phase 7). */}
        </div>
        <div className={footerStyles['footer-right']}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

// TODO make footer sticky
