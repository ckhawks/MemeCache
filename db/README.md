# Database

`schema.sql` is the schema of the live database, dumped 2026-08-09. Before that date the
schema had never existed anywhere outside the hosted Neon instance — not in this repo, not
in any branch. Treat this file as the source of truth from here on.

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

## Known problems in the schema

Recorded here rather than fixed, because changing them is migration work. See TODO.md.

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
