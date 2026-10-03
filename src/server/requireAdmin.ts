import { notFound } from 'next/navigation';
import { getUserFromAccessToken, UserPayload } from '@/auth/lib';
import { isAdmin } from '@/auth/role';

// For admin pages: the admin user, or the not-found page for everyone else, so the page's
// existence is not advertised.
export async function requireAdmin(): Promise<UserPayload> {
  const user = await getUserFromAccessToken();
  if (!user || !isAdmin(user)) {
    notFound();
  }
  return user;
}
