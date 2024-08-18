import { db } from '@/db/db';

export async function getOnlineUsers() {
  const query = `
    SELECT id, username, email, role FROM "User"
    WHERE "lastActive" >= NOW() - INTERVAL '15 minutes'
  `;
  const users = await db(query, []);
  return users;
}
