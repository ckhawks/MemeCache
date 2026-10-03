import { listOnlineUsers } from '@/db/queries/users';

// Feeds the public /api/users/online endpoint, so only ids and usernames. This used to
// return every online user's email address to anyone who asked.
export async function getOnlineUsers() {
  return listOnlineUsers();
}
