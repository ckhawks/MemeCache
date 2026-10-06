import { db } from '@/db/db';
import { isUuid } from './ids';

// Following other members (migration 020). Private apart from the follower count.

// Follows or unfollows. Idempotent: following twice keeps the first row and its date,
// unfollowing someone not followed does nothing. Returns whether this call created the
// follow, so the caller knows when to notify. Following yourself is refused by the table.
export async function setFollow(followerId: string, followeeId: string, following: boolean) {
  if (following) {
    const rows = await db(
      `INSERT INTO user_follow (follower_id, followee_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [followerId, followeeId]
    );
    return rows.length > 0;
  }
  await db(`DELETE FROM user_follow WHERE follower_id = $1 AND followee_id = $2`, [
    followerId,
    followeeId,
  ]);
  return false;
}

export async function isFollowing(followerId: string | undefined, followeeId: string) {
  if (!isUuid(followerId) || !isUuid(followeeId)) {
    return false;
  }
  const [row] = await db(
    `SELECT 1 FROM user_follow WHERE follower_id = $1 AND followee_id = $2`,
    [followerId, followeeId]
  );
  return !!row;
}

export interface FollowCounts {
  // People who follow this user.
  followers: number;
  // People this user follows.
  following: number;
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  if (!isUuid(userId)) {
    return { followers: 0, following: 0 };
  }
  const [row] = await db<FollowCounts>(
    `SELECT (SELECT count(*)::int FROM user_follow WHERE followee_id = $1) AS followers,
            (SELECT count(*)::int FROM user_follow WHERE follower_id = $1) AS following`,
    [userId]
  );
  return row;
}

// A member who can be followed: exists and has not deleted their account.
export async function isFollowableUser(userId: string): Promise<boolean> {
  if (!isUuid(userId)) {
    return false;
  }
  const [row] = await db(`SELECT 1 FROM app_user WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  return !!row;
}

// Whether the viewer follows anyone, for Explore's For you.
export async function followsAnyone(userId: string): Promise<boolean> {
  if (!isUuid(userId)) {
    return false;
  }
  const [row] = await db(`SELECT 1 FROM user_follow WHERE follower_id = $1 LIMIT 1`, [userId]);
  return !!row;
}
