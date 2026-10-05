import { getUserFromAccessToken } from '@/auth/lib';
import { isAdmin } from '@/auth/role';
import { getAvatarKey, getKarma } from '@/db/queries/users';
import NavigationBarClient from './NavigationBarClient';

// Reads the session itself, so pages render <NavigationBar /> without passing the user
// down. getUserFromAccessToken is cached per request, so this adds no second lookup.
export default async function NavigationBar() {
  const user = await getUserFromAccessToken();
  const [karma, avatarKey] = user
    ? await Promise.all([getKarma(user.id), getAvatarKey(user.id)])
    : [0, null];
  return (
    <NavigationBarClient
      username={user?.username ?? ''}
      avatarKey={avatarKey}
      karma={karma}
      isAdmin={!!user && isAdmin(user)}
    />
  );
}
