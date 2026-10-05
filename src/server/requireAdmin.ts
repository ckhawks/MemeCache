import { notFound } from 'next/navigation';
import { getUserFromAccessToken, UserPayload } from '@/auth/lib';
import { isAdmin, isModerator } from '@/auth/role';

// For admin pages: the admin user, or the not-found page for everyone else, so the page's
// existence is not advertised.
export async function requireAdmin(): Promise<UserPayload> {
  const user = await getUserFromAccessToken();
  if (!user || !isAdmin(user)) {
    notFound();
  }
  return user;
}

// The same, for pages moderators may use too.
export async function requireModerator(): Promise<UserPayload> {
  const user = await getUserFromAccessToken();
  if (!user || !isModerator(user)) {
    notFound();
  }
  return user;
}
