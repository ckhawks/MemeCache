import { getUserFromAccessToken } from '@/auth/lib';
import { isAdmin } from '@/auth/role';
import { getAvatarKey, getKarma } from '@/db/queries/users';
import { countUnreadNotifications } from '@/db/queries/notifications';
import NavigationBarClient from './NavigationBarClient';

// Reads the session itself, so pages render <NavigationBar /> without passing the user
// down. getUserFromAccessToken is cached per request, so this adds no second lookup.
export default async function NavigationBar() {
  const user = await getUserFromAccessToken();
  const [karma, avatarKey, unreadNotifications] = user
    ? await Promise.all([
        getKarma(user.id),
        getAvatarKey(user.id),
        countUnreadNotifications(user.id),
      ])
    : [0, null, 0];
  return (
    <NavigationBarClient
      username={user?.username ?? ''}
      avatarKey={avatarKey}
      karma={karma}
      unreadNotifications={unreadNotifications}
      isAdmin={!!user && isAdmin(user)}
    />
  );
}
