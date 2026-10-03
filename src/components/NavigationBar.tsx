'use client';

import Link from 'next/link';
import styles from '../app/main.module.scss';
import navStyles from './NavigationBar.module.scss';
import { usePathname } from 'next/navigation';
import { Compass, Grid, Home, LogIn, LogOut, PlusSquare, User } from 'react-feather';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Only shown when logged in.
  private?: boolean;
}

export default function NavigationBar(props: { username: string }) {
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
      href: profileHref,
      label: 'Profile',
      icon: <User size={20} />,
      private: true,
    },
  ];
  const visible = items.filter((item) => !item.private || props.username);

  // The phone tab bar also needs Home, and a way to log in when signed out.
  const tabs: NavItem[] = [
    {
      href: '/',
      label: 'Home',
      icon: <Home size={20} />,
    },
    ...visible,
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
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${navStyles['navbar-link']} ${
                  pathname === item.href ? navStyles['active'] : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className={navStyles['navbar-right']}>
            {props.username && (
              <>
                <Link
                  prefetch={false}
                  href={'/api/logout'}
                  className={`${navStyles['navbar-link']} ${navStyles['desktop-only']}`}
                >
                  Log out <LogOut size={14} />
                </Link>
                <Link
                  href={profileHref}
                  style={{ textDecoration: 'none', color: 'unset' }}
                  className={navStyles['navbar-right-user']}
                >
                  <img
                    src={'/api/resource/avatar/' + props.username}
                    width={21}
                    height={21}
                    alt=""
                    className={navStyles['profile-picture']}
                  />
                  {props.username}
                </Link>
              </>
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
            href={item.href}
            className={`${navStyles['tab']} ${pathname === item.href ? navStyles['active'] : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
