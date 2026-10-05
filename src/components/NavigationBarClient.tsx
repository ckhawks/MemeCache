'use client';

import Link from 'next/link';
import styles from '../app/main.module.scss';
import navStyles from './NavigationBar.module.scss';
import { usePathname } from 'next/navigation';
import Tooltip from './Tooltip';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import { CheckSquare, Compass, Grid, Home, LogIn, PlusSquare, User } from 'react-feather';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Needs an account. Logged out, it still shows, dimmed, and leads to the login page.
  private?: boolean;
}

// Rendered by NavigationBar (the server component), which reads the session.
export default function NavigationBarClient(props: {
  username: string;
  avatarKey: string | null;
  karma: number;
  unreadNotifications: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const profileHref = '/me/' + props.username;

  const items: NavItem[] = [
    {
      href: '/explore',
      label: 'Explore',
      icon: <Compass size={20} />,
    },
    {
      href: '/library',
      label: 'Library',
      icon: <Grid size={20} />,
      private: true,
    },
    {
      href: '/upload',
      label: 'Upload',
      icon: <PlusSquare size={20} />,
      private: true,
    },
    {
      href: '/queue',
      label: 'Queue',
      icon: <CheckSquare size={20} />,
      private: true,
    },
    {
      href: profileHref,
      label: 'Profile',
      icon: <User size={20} />,
      private: true,
    },
  ];
  const signedIn = props.username !== '';
  const locked = (item: NavItem) => !!item.private && !signedIn;
  // A locked item goes to the login page, and from there back to where it pointed. Profile
  // has no username to point at yet, so login's own default (home) does.
  const hrefFor = (item: NavItem) => {
    if (!locked(item)) {
      return item.href;
    }
    return item.href === profileHref ? '/login' : '/login?next=' + encodeURIComponent(item.href);
  };

  // The phone tab bar also needs Home, and a way to log in when signed out. Logged out, Log in
  // takes Profile's place, which would only lead to the same login page.
  const tabs: NavItem[] = [
    {
      href: '/',
      label: 'Home',
      icon: <Home size={20} />,
    },
    ...items.filter((item) => signedIn || item.href !== profileHref),
    ...(props.username
      ? []
      : [
          {
            href: '/login',
            label: 'Log in',
            icon: <LogIn size={20} />,
          },
        ]),
  ];

  return (
    <>
      <div className={navStyles['wrapper']}>
        <div className={navStyles['navbar']}>
          <div className={navStyles['navbar-left']}>
            <Link href={'/'} className={navStyles['logo']}>
              <h5>MemeCache</h5>
            </Link>
          </div>

          {/* Desktop: inline links. Hidden on phones, where the tab bar below takes over. */}
          <div className={navStyles['navbar-links']}>
            <Link
              href={'/'}
              className={`${navStyles['navbar-link']} ${pathname === '/' ? navStyles['active'] : ''}`}
            >
              Home
            </Link>
            {items.map((item) =>
              locked(item) ? (
                <Tooltip key={item.href} label={`Log in to use ${item.label}`} below>
                  <Link
                    href={hrefFor(item)}
                    className={`${navStyles['navbar-link']} ${navStyles['locked']}`}
                  >
                    {item.label}
                  </Link>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${navStyles['navbar-link']} ${
                    pathname === item.href ? navStyles['active'] : ''
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
            {/* Desktop only: the phone tab bar is full, so phones reach it from the profile. */}
            {props.isAdmin && (
              <Link
                href="/admin"
                className={`${navStyles['navbar-link']} ${
                  pathname.startsWith('/admin') ? navStyles['active'] : ''
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          <div className={navStyles['navbar-right']}>
            {/* On phones too: the tab bar has no room for it. */}
            {props.username && <NotificationBell unread={props.unreadNotifications} />}
            {props.username && (
              <UserMenu
                username={props.username}
                avatarKey={props.avatarKey}
                karma={props.karma}
                isAdmin={props.isAdmin}
              />
            )}
            {!props.username && (
              <Link href={'/login'} className={`${styles['button']} ${styles['button-small']}`}>
                Log in
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Phones: a fixed bottom tab bar, where thumbs reach. */}
      <nav className={navStyles['tabbar']} aria-label="Main">
        {tabs.map((item) => (
          <Link
            key={item.href}
            href={hrefFor(item)}
            className={`${navStyles['tab']} ${pathname === item.href ? navStyles['active'] : ''} ${
              locked(item) ? navStyles['locked'] : ''
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
