# Database

`schema.sql` is the **baseline**: the schema as dumped from Neon on 2026-08-09, before any
migration. The current schema is that file plus `migrations/` in order, which is exactly how
`npm run db:seed` and the tests build a database. Migration 002 replaced every table, so
the names in `schema.sql` (`"Meme"`, `"MemeTagVote"`) no longer exist anywhere live; the
current tables are `app_user`, `meme`, `meme_like`, `tag`, `meme_tag`, `meme_tag_vote` and
`meme_transcription`.

## Regenerating

```bash
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL_DIRECT" > db/schema.sql
```

Two things to know:

- **Use the direct endpoint, not the pooler.** The `DATABASE_URL` in `.env` points at Neon's
  `-pooler` host. `pg_dump` does not work reliably through PgBouncer in transaction mode.
  Strip `-pooler` from the hostname.
- **`pg_dump` 18 emits `\restrict` / `\unrestrict` psql meta-commands** wrapping the dump,
  with a random token that changes every run. They are stripped from the committed file —
  they produce pointless diff churn and older `psql` clients reject them. If you regenerate,
  strip lines starting with a backslash.

Server is PostgreSQL **16.14** on Neon. The migration target (Dallas, port 7465) runs **17**.

## Backups

Full dumps (schema **and** rows) live in `db/backups/`, which is gitignored — they contain
user email addresses and bcrypt password hashes and must never be committed. `.gitignore`
also covers `*.dump` anywhere in the tree as a second line of defence. `schema.sql` is
schema-only, so it is tracked.

Being gitignored means these are **not backed up by pushing**. Once the database moves to
Dallas it falls under the existing nightly dump to Chicago; until then, copy anything you
care about somewhere durable yourself.

To take one:

```bash
pg_dump --no-owner --no-privileges -Fc \
  -f db/backups/memecache-full-$(date +%F).dump "$DATABASE_URL_DIRECT"
```

Restore with `pg_restore -d <target> <file>`. Current contents:

| File | Taken | Source |
|---|---|---|
| `memecache-full-2026-08-09.dump` | 2026-08-09 | Neon, PostgreSQL 16.14, custom format, 70 KB |

## Requirements

The schema depends on the **`uuid-ossp`** extension. It must be created in the target
database before restoring.

## Current size (2026-08-09)

| Table | Rows |
|---|---|
| Meme | 193 |
| MemeCache | 193 |
| MemeTag | 206 |
| MemeTagVote | 206 |
| Tag | 151 |
| MemeTranscription | 74 |
| RefreshToken | 92 |
| Like | 67 |
| User | 15 |
| Cache | 15 |

Small enough that the migration is a single dump and restore with no downtime planning
needed. Note `pg_stat_user_tables.n_live_tup` disagrees with these — it is an autovacuum
estimate, not a count. Use `count(*)`.

## Known problems in the baseline schema

Recorded against `schema.sql` on 2026-08-09. All eight are resolved: 4 and 5 by migration
001, the rest by migration 002 (caches and `RefreshToken` dropped, one naming convention,
`deleted_at` used on `meme` and dropped elsewhere). Existing user ids stay uuid v1; new
rows get v4 from `gen_random_uuid()`. Kept for the history.

1. **`Cache` has `UNIQUE ("ownerUserId")` — each user can have exactly one cache.** This is
   why "create cache" was never built and why the `+ Cache` button on the profile page does
   nothing: the schema forbids a second one. All 15 users have exactly one. Supporting
   multiple caches means dropping this constraint.

2. **`MemeCache` has `UNIQUE ("memeId")` — a meme belongs to exactly one cache.** Despite
   having the shape of a join table, it is not many-to-many.

3. **Three naming conventions coexist.** `Meme`, `Like`, `Cache`, `User`, `MemeCache` and
   `RefreshToken` use quoted camelCase (`"memeId"`). `MemeTag`, `MemeTagVote` and `Tag` use
   unquoted lowercase (`memeid`, `createdat`). `MemeTranscription` uses snake_case
   (`meme_id`, `edited_by`, `created_at`). Query code has to match each one exactly.

4. **No index on `Like."memeId"`.** The only indexes in the database are the ones implied by
   primary keys and unique constraints — there is not a single explicit `CREATE INDEX`.
   Every feed query on `/explore`, `/library`, `/me/[username]` and `/t/[tagName]` does
   `LEFT JOIN "Like" l ON l."memeId" = m.id`, which is a sequential scan over `Like` each
   time. Same gap on `Meme."uploaderUserId"`, `MemeTranscription.meme_id`, and the `tagid`
   columns of `MemeTag` / `MemeTagVote` (their composite PKs lead with `memeid`, so `tagid`
   alone is unindexed — which is what `/t/[tagName]` filters on).

5. **Uniqueness is case-sensitive but the code checks case-insensitively.**
   `User.username` and `Tag.name` both have plain `UNIQUE` constraints, while `register`
   and the tag-create path query with `LOWER(...) = LOWER(...)`. The check-then-insert is
   racy and a direct insert bypasses it entirely. No collisions exist today (verified), but
   nothing prevents them. The fix is a unique index on `LOWER(username)` / `LOWER(name)`.

6. **`RefreshToken."userId"` is `character varying`, not `uuid`, and has no foreign key.**
   Every other user reference is a `uuid` with an FK. Deleting a user leaves their refresh
   tokens behind.

7. **`User.id` defaults to `uuid_generate_v1()`.** v1 encodes the generating machine's MAC
   address and a timestamp, making ids sequential and partly predictable. `Cache` and `Tag`
   use `uuid_generate_v4()`. New tables should use v4; changing `User` means rewriting
   existing ids and every FK pointing at them, so it is probably not worth it.

8. **`deletedAt` columns already exist on `Meme`, `Like` and `User` and are never used.**
   Nothing reads or writes them; `/api/meme/delete` hard-deletes the row and purges the S3
   object. This is good news for the DMCA work in Phase 7 — soft delete needs a code change,
   not a schema change.
