import { db } from '@/db/db';
import { isUuid } from './ids';
import { warningsSql } from './warnings';
import { mutedSql } from './tagPreferences';
import { curationKarmaSql, karmaSql, postKarmaSql } from './users';
import type { ContentWarning } from '@/constants/contentWarnings';

// Lists of accounts: the admin users table and Browse people. Each sorts by one column picked
// from a whitelist, so the ORDER BY is never built from input.

// LIKE treats % and _ as wildcards; a search for "a_b" means those characters.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

// The admin users table (/admin/users): every account, deleted ones too when asked, with what
// an admin wants to compare at a glance. Filtered by part of the username, and paged.

export const ADMIN_USER_SORTS = [
  'username',
  'role',
  'joined',
  'active',
  'uploads',
  'post',
  'curation',
  'followers',
  'trust',
] as const;

export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];

export function isAdminUserSort(value: unknown): value is AdminUserSort {
  return typeof value === 'string' && (ADMIN_USER_SORTS as readonly string[]).includes(value);
}

const ADMIN_SORT_SQL: Record<AdminUserSort, string> = {
  username: 'lower(username)',
  role: `CASE role WHEN 'admin' THEN 2 WHEN 'moderator' THEN 1 ELSE 0 END`,
  joined: 'created_at',
  active: 'last_active',
  uploads: 'uploads',
  post: '"postKarma"',
  curation: '"curationKarma"',
  followers: 'followers',
  // Descending: held first, then pinned trusted, then left to their record.
  trust: `CASE WHEN held THEN 2 WHEN "trustOverride" = 'trusted' THEN 1 ELSE 0 END`,
};

export interface AdminUserRow {
  id: string;
  username: string;
  role: string;
  avatarKey: string | null;
  createdAt: Date | null;
  lastActive: Date | null;
  uploads: number;
  postKarma: number;
  curationKarma: number;
  followers: number;
  // From user_trust (migration 005): held now, whether by record or by an admin.
  held: boolean;
  trustOverride: 'trusted' | 'held' | null;
  deletedAt: Date | null;
  // The invite code they signed up with (migration 009). Null when none was recorded.
  inviteCode: string | null;
}

const ADMIN_FILTER = `($1 = '' OR lower(u.username) LIKE '%' || lower($1) || '%')
          AND ($2 OR u.deleted_at IS NULL)`;

export async function listUsersForAdmin(options: {
  sort?: AdminUserSort;
  dir?: 'asc' | 'desc';
  query?: string;
  includeDeleted?: boolean;
  page?: number;
  perPage?: number;
}): Promise<{ rows: AdminUserRow[]; total: number }> {
  const sort = isAdminUserSort(options.sort) ? options.sort : 'joined';
  const dir = options.dir === 'asc' ? 'ASC' : 'DESC';
  const perPage = options.perPage ?? 50;
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const filter = [escapeLike(options.query?.trim().slice(0, 64) ?? ''), options.includeDeleted ?? false];
  const [rows, [count]] = await Promise.all([
    db<AdminUserRow>(
      `WITH listed AS (
         SELECT u.id,
                u.username,
                u.role,
                u.avatar_s3_key AS "avatarKey",
                u.created_at,
                u.last_active,
                u.deleted_at AS "deletedAt",
                (SELECT count(*)::int FROM meme m WHERE m.uploader_id = u.id AND m.deleted_at IS NULL) AS uploads,
                ${postKarmaSql('u.id')} AS "postKarma",
                ${curationKarmaSql('u.id')} AS "curationKarma",
                (SELECT count(*)::int FROM user_follow f WHERE f.followee_id = u.id) AS followers,
                t.held,
                u.trust_override AS "trustOverride",
                ic.code AS "inviteCode"
           FROM app_user u
           JOIN user_trust t ON t.user_id = u.id
           LEFT JOIN invite_code ic ON ic.id = u.invited_by_code_id
          WHERE ${ADMIN_FILTER}
       )
       SELECT id,
              username,
              role,
              "avatarKey",
              created_at AS "createdAt",
              last_active AS "lastActive",
              "deletedAt",
              uploads,
              "postKarma",
              "curationKarma",
              followers,
              held,
              "trustOverride",
              "inviteCode"
         FROM listed
        ORDER BY ${ADMIN_SORT_SQL[sort]} ${dir} NULLS LAST, lower(username), id
        LIMIT $3 OFFSET $4`,
      [...filter, perPage, page * perPage]
    ),
    db<{ total: number }>(`SELECT count(*)::int AS total FROM app_user u WHERE ${ADMIN_FILTER}`, filter),
  ]);
  return { rows, total: count.total };
}

// Browse people (/users): everyone who has not deleted their account, each with a strip of
// their most-liked uploads. Memes with a tag the viewer muted (migration 016) stay out of the
// strips, as on Browse tags.

export const PEOPLE_SORTS = [
  'karma',
  'followers',
  'new',
  'active',
] as const;

export type PeopleSort = (typeof PEOPLE_SORTS)[number];

export function isPeopleSort(value: unknown): value is PeopleSort {
  return typeof value === 'string' && (PEOPLE_SORTS as readonly string[]).includes(value);
}

// "Active" is how much they added in the last 30 days (uploads, tags, transcriptions), not
// when they were last online, which a public list should not give away.
const PEOPLE_SORT_SQL: Record<PeopleSort, string> = {
  karma: 'karma DESC',
  followers: 'followers DESC, karma DESC',
  new: 'created_at DESC NULLS LAST',
  active: 'recent DESC, karma DESC',
};

export interface PersonRow {
  id: string;
  username: string;
  avatarKey: string | null;
  karma: number;
  followers: number;
  uploads: number;
  // The viewer follows them. Always false for visitors.
  following: boolean;
  memes: {
    id: string;
    slug: string;
    contentType: string;
    warnings: ContentWarning[];
  }[];
}

export async function listPeople(options: {
  sort?: PeopleSort;
  viewerId?: string;
  page?: number;
  perPage?: number;
  memesPerPerson?: number;
}): Promise<{ rows: PersonRow[]; nextPage: number | null }> {
  const sort = isPeopleSort(options.sort) ? options.sort : 'karma';
  const perPage = options.perPage ?? 12;
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const order = PEOPLE_SORT_SQL[sort];
  const rows = await db<PersonRow>(
    `WITH people AS (
       SELECT u.id,
              u.username,
              u.avatar_s3_key AS "avatarKey",
              u.created_at,
              ${karmaSql('u.id')} AS karma,
              (SELECT count(*)::int FROM user_follow f WHERE f.followee_id = u.id) AS followers,
              (SELECT count(*)::int FROM meme m WHERE m.uploader_id = u.id AND m.deleted_at IS NULL) AS uploads,
              ((SELECT count(*)
                  FROM meme m
                 WHERE m.uploader_id = u.id
                   AND m.deleted_at IS NULL
                   AND m.created_at >= now() - interval '30 days')
             + (SELECT count(*)
                  FROM meme_tag mt
                 WHERE mt.added_by = u.id
                   AND mt.created_at >= now() - interval '30 days')
             + (SELECT count(*)
                  FROM meme_transcription tr
                 WHERE tr.edited_by = u.id
                   AND tr.created_at >= now() - interval '30 days'))::int AS recent
         FROM app_user u
        WHERE u.deleted_at IS NULL
     ),
     picked AS (
       SELECT *
         FROM people
        ORDER BY ${order}, lower(username), id
        LIMIT $1 OFFSET $2
     )
     SELECT p.id,
            p.username,
            p."avatarKey",
            p.karma,
            p.followers,
            p.uploads,
            EXISTS (
              SELECT 1 FROM user_follow f WHERE f.follower_id = $3::uuid AND f.followee_id = p.id
            ) AS following,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', r.id,
                       'slug', r.slug,
                       'contentType', r.content_type,
                       'warnings', ${warningsSql('r.id')}
                     ) ORDER BY r.likes DESC, r.created_at DESC)
                FROM (
                  SELECT m.id,
                         m.slug,
                         m.content_type,
                         m.created_at,
                         (SELECT count(*)
                            FROM meme_like l
                           WHERE l.meme_id = m.id AND l.removed_at IS NULL AND l.user_id <> m.uploader_id) AS likes
                    FROM meme m
                   WHERE m.uploader_id = p.id
                     AND m.deleted_at IS NULL
                     AND NOT ${mutedSql('m.id', '$3')}
                   ORDER BY likes DESC, m.created_at DESC
                   LIMIT $4
                ) r
            ), '[]') AS memes
       FROM picked p
      ORDER BY ${order}, lower(p.username), p.id`,
    [perPage + 1, page * perPage, isUuid(options.viewerId) ? options.viewerId : null, options.memesPerPerson ?? 6]
  );
  const hasMore = rows.length > perPage;
  return { rows: rows.slice(0, perPage), nextPage: hasMore ? page + 1 : null };
}
