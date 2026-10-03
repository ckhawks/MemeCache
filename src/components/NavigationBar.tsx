import { getUserFromAccessToken } from '@/auth/lib';
import { isAdmin } from '@/auth/role';
import NavigationBarClient from './NavigationBarClient';

// Reads the session itself, so pages render <NavigationBar /> without passing the user
// down. getUserFromAccessToken is cached per request, so this adds no second lookup.
export default async function NavigationBar() {
  const user = await getUserFromAccessToken();
  return <NavigationBarClient username={user?.username ?? ''} isAdmin={!!user && isAdmin(user)} />;
}
