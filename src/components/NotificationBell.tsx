'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Bell } from 'react-feather';
import navStyles from './NavigationBar.module.scss';
import styles from './Notifications.module.scss';
import CountBadge from './CountBadge';
import NotificationList from './NotificationList';
import { api } from '@/util/api';
import type { NotificationGroup } from '@/db/queries/notifications';

// Shared with the notifications page, which revalidates it after marking everything read.
export const UNREAD_COUNT_KEY = '/api/notifications/count';

const fetcher = (url: string) => api<{ unread: number }>(url);

type Group = Omit<NotificationGroup, 'createdAt'> & { createdAt: string };

// The bell beside the profile pill. The server renders the unread count with every page, so
// it is fresh after each navigation; between navigations it is polled every couple of
// minutes while the tab is visible. Opening the popover marks what it shows as read.
export default function NotificationBell(props: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const { data, mutate } = useSWR(UNREAD_COUNT_KEY, fetcher, {
    fallbackData: { unread: props.unread },
    revalidateOnMount: false,
    refreshInterval: 120_000,
  });

  // A navigation brings a fresh count from the server; it wins over the last poll.
  useEffect(() => {
    mutate({ unread: props.unread }, { revalidate: false });
  }, [props.unread, mutate]);

  // Navigating anywhere closes it.
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

  const load = async () => {
    setError('');
    try {
      const result = await api<{ notifications: Group[] }>('/api/notifications');
      setGroups(result.notifications);
      // Marked read only once shown, and only up to the newest one shown.
      const newest = result.notifications.reduce((max, g) => Math.max(max, Number(g.id)), 0);
      if (result.notifications.some((g) => g.unread)) {
        await api('/api/notifications/read', {
          body: { throughId: String(newest) },
        });
        mutate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.');
    }
  };

  const toggle = () => {
    if (!open) {
      load();
    }
    setOpen(!open);
  };

  const unread = data?.unread ?? 0;

  return (
    <div ref={wrapRef} className={styles['bell-wrap']}>
      <button
        type="button"
        className={styles['bell']}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={toggle}
      >
        <Bell size={15} />
        <CountBadge count={unread} className={styles['bell-count']} />
      </button>
      {open && (
        // A link to the page already open changes no path, so clicks on links close it too.
        <div
          className={`${navStyles['menu']} ${styles['popover']}`}
          role="dialog"
          aria-label="Notifications"
          onClick={(e) => {
            if ((e.target as Element).closest('a')) {
              setOpen(false);
            }
          }}
        >
          <div className={styles['popover-header']}>Notifications</div>
          <div className={styles['popover-body']}>
            {error && <div className={styles['popover-note']}>{error}</div>}
            {!error && groups === null && <div className={styles['popover-note']}>Loading…</div>}
            {!error && groups?.length === 0 && (
              <div className={styles['popover-note']}>
                Nothing yet. Likes, tags and reviews of your work show up here.
              </div>
            )}
            {groups && groups.length > 0 && <NotificationList groups={groups} />}
          </div>
          <div className={styles['popover-footer']}>
            <Link href="/notifications" className={navStyles['menu-item']}>
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
