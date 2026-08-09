# Migrating from Neon to self-hosted Postgres

Runbook for Phase 2 of TODO.md. Target is the Dallas box, `extravm-puckvps-1`, Postgres 17
on port **7465** (not 5432 — connecting without `-p` fails with "connection refused").

Nothing here has been executed yet. The application-side driver swap is done and verified;
everything below is the server-side work.

## Before you start

**Middleware is a hard prerequisite.** `src/middleware.ts` runs in the Edge Runtime and
transitively imports `pg`, which cannot run there. See "The middleware problem" at the
bottom. Resolve that before deploying the driver swap anywhere.

## 1. Create the database and a least-privilege role

The app currently connects to Neon as `test_owner`, a member of `neon_superuser` holding
`pg_read_all_data` and `pg_write_all_data`. Do not reproduce that. The app needs to read
and write its own tables and nothing else.

```sql
-- as a superuser on the Dallas cluster
CREATE ROLE memecache_app LOGIN PASSWORD '<generate one>';
CREATE DATABASE memecache OWNER memecache_app;

\c memecache
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Owning the database lets the role create its own tables during the restore. If you would
rather it not own them, restore as a superuser and then:

```sql
GRANT CONNECT ON DATABASE memecache TO memecache_app;
GRANT USAGE ON SCHEMA public TO memecache_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO memecache_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memecache_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memecache_app;
```

Remember `pg_hba.conf` is per-database per-host and is the thing that bites — a role can
hold every privilege in the cluster and still be refused at connect time with
`no pg_hba.conf entry`. Rules are at `/etc/postgresql/17/main/pg_hba.conf`; apply with
`SELECT pg_reload_conf()` rather than a restart, then check:

```sql
SELECT * FROM pg_hba_file_rules WHERE error IS NOT NULL;
```

## 2. Restore

`db/backups/memecache-full-2026-08-09.dump` is a custom-format dump of the whole database.
Take a fresh one at cutover — that file is only as current as its date.

```bash
pg_dump --no-owner --no-privileges -Fc \
  -f memecache-cutover.dump "$NEON_DIRECT_URL"

pg_restore -h 127.0.0.1 -p 7465 -U postgres -d memecache \
  --no-owner --no-privileges memecache-cutover.dump
```

Use the Neon **direct** endpoint, not `-pooler`.

Source is PostgreSQL 16.14, target is 17. Restoring forward a major version is supported.

## 3. Apply migrations

Migration 001 has never run against production — the Neon role has no `CREATE` on schema
`public`. The restored database is where it lands.

```bash
DATABASE_URL='postgresql://memecache_app:...@127.0.0.1:7465/memecache' \
  npm run db:migrate
```

Rehearsed locally: `schema.sql` restores clean into an empty database, `001` applies, and
re-running is a no-op.

## 4. Verify

Row counts as of 2026-08-09 — compare against the source at cutover, do not trust these
numbers:

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

```sql
SELECT 'Meme', count(*) FROM "Meme"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'Like', count(*) FROM "Like";
```

Use `count(*)`. `pg_stat_user_tables.n_live_tup` is an autovacuum estimate and disagreed
with reality by a factor of two on this database.

Also confirm the extension, the indexes from 001, and that the app role can actually
connect and write:

```sql
SELECT extname FROM pg_extension;                      -- expect uuid-ossp
SELECT indexname FROM pg_indexes WHERE schemaname='public';
```

## 5. Point the app at it

`DATABASE_URL` in the app's `.env`, then restart. It is read at runtime, so this is a
restart and not a rebuild. No code change — `src/db/db.ts` already speaks the standard wire
protocol to either host.

## 6. Backups

The nightly dump to Chicago runs one dump file per database and the backup role
`user_does_backups` holds cluster-level `pg_read_all_data`, so a new database *should* be
picked up automatically. The `pg_hba` rule is `host all user_does_backups <chicago-ip>/32
md5`, which covers `all` databases.

**Verify rather than assume** — confirm a `memecache` dump file actually appears in
Chicago the morning after cutover. Note there is no WAL archiving and no replica, so
recovery exposure is up to 24 hours back to the last 03:30 dump.

## 7. Decommission

Keep Neon alive and read-only for a week. It is the only rollback.

---

## The middleware problem

`src/middleware.ts` imports `validateAccessToken` and `handleTokenRefresh` from
`src/auth/lib.ts`, which imports `src/db/db.ts`. Middleware runs in the **Edge Runtime**,
which has no TCP sockets, so `pg` cannot work there. `@neondatabase/serverless` could,
because it talks HTTP — that is why it was chosen, and self-hosted Postgres removes the
option.

Next 14 cannot run middleware on the Node runtime; `experimental.nodeMiddleware` arrived in
15.2.

What middleware does today is narrower than it looks. It sets a `middleware_run` cookie
that only exists to drive `MiddlewareValidator`'s full-page reload, and it refreshes the
access token — but it sets the new cookie on the **response**, while the server component
reads the **request**, so the refresh does not help the render that triggered it. It only
helps the next request. That is the bug behind "random sign outs" and "no session on first
SSR load" in TODO.md.

Options, in rough order of preference:

1. **Make middleware DB-free.** Verify the access-token signature with `jose`, which is
   Edge-safe, and nothing else. Move refresh into a Node route handler. Deletes
   `MiddlewareValidator` and the `middleware_run` cookie. This is Phase 5's plan, pulled
   forward.
2. **Delete middleware entirely and lengthen the access token.** If the access token lives
   as long as the refresh token, per-request refresh stops mattering and
   `getUserFromAccessToken()` in Node covers everything. Simplest by a distance; the cost
   is that revoking a session no longer takes effect within 15 minutes.
3. **Upgrade to Next 16 first**, then run middleware on the Node runtime and keep the
   current logic. Also clears the 5 remaining npm advisories, which only resolve on that
   major. But a 14 to 16 upgrade is its own project and would be happening during a
   database migration.
