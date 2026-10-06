'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Edit2, LogOut, Moon, Settings, Sun, User } from 'react-feather';
import styles from './NavigationBar.module.scss';
import { avatarUrl } from '@/util/avatarUrl';
import { useTheme } from '@/contexts/LightThemeContext';
import InstallAppItem from './InstallAppItem';

// The profile pill in the top right. Clicking it opens a small menu: your profile, editing
// it, admin for admins, the light/dark switch, and logging out, which used to sit loose
// beside the pill.
export default function UserMenu(props: {
  username: string;
  avatarKey: string | null;
  karma: number;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const profileHref = '/me/' + encodeURIComponent(props.username);

  // Following a link in the menu closes it.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles['user-menu']}>
      <button
        type="button"
        className={styles['navbar-right-user']}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl(props.username, props.avatarKey)}
          width={21}
          height={21}
          alt=""
          className={styles['profile-picture']}
        />
        {props.username}
        <span className={styles['navbar-right-karma']} title="Karma">
          {props.karma.toLocaleString()}
        </span>
      </button>
      {open && (
        <div className={styles['menu']} role="menu">
          <Link href={profileHref} className={styles['menu-item']} role="menuitem">
            <User size={14} /> Profile
          </Link>
          <Link href={profileHref + '/edit'} className={styles['menu-item']} role="menuitem">
            <Edit2 size={14} /> Edit profile
          </Link>
          {props.isAdmin && (
            <Link href="/admin" className={styles['menu-item']} role="menuitem">
              <Settings size={14} /> Admin
            </Link>
          )}
          <div className={styles['menu-divider']} role="separator" />
          {/* Stays open, so the switch can be flipped back and forth to compare. */}
          <button type="button" className={styles['menu-item']} role="menuitem" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <InstallAppItem />
          <Link prefetch={false} href="/api/logout" className={styles['menu-item']} role="menuitem">
            <LogOut size={14} /> Log out
          </Link>
        </div>
      )}
    </div>
  );
}
