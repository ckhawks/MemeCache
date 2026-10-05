'use client';

import { useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { api } from '@/util/api';
import { UNREAD_COUNT_KEY } from '@/components/NotificationBell';

// Marks what the page showed as read once it is on screen, then refreshes the bell. Done
// from the browser rather than while rendering, so a prefetch of the page reads nothing.
export default function MarkNotificationsRead(props: { throughId: string }) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    api('/api/notifications/read', {
      body: { throughId: props.throughId },
    })
      .then(() => mutate(UNREAD_COUNT_KEY))
      .catch((error) => console.error('Could not mark notifications read:', error));
  }, [props.throughId, mutate]);

  return null;
}
