# Migrating from Neon to self-hosted Postgres

Runbook for Phase 2 of TODO.md. Target is the Dallas box, `extravm-puckvps-1`, Postgres 17
on port **7465** (not 5432 — connecting without `-p` fails with "connection refused").

## Status: CUTOVER COMPLETE, 2026-08-09

`memecache.me` is served from Dallas against Dallas Postgres. Steps 1 to 5 are done.
Steps 6 and 7 — confirming the Chicago backup and decommissioning Neon — remain.

**No data was lost.** Neon was compared against the dump after cutover and came back
byte-identical on all 10 tables, so nothing was written to it between the dump at 08:57 and
the DNS change. The newest content predates today by months regardless.

**Neon is still running, unmodified, and is the rollback.** Leave it a week.

### What was verified

| Check | Result |
|---|---|
| Row counts, all 10 tables | Match source exactly |
| Content checksums (`md5` of ordered row text), all 10 tables | Byte-identical |
| Sequence positions (4 sequences) | Match — no duplicate-key risk on first insert |
| Migration 001 applied | Yes, ledger row written as the runner would |
| Indexes from 001 | All 8 present |
| Case-insensitive username uniqueness | Enforced; probe rejected and rolled back |
| App role connects and owns its tables | Yes, `memecache_app` |
| Other 8 databases on the cluster | Untouched |

The only restore error was `COMMENT ON EXTENSION "uuid-ossp"`, which needs extension
ownership and is purely cosmetic.

### What exists on Dallas now

- database `memecache`, role `memecache_app` (both new; nothing pre-existing was modified)
- `/root/.memecache-db-credentials`, mode 0600, holding the generated password and a
  ready-made `DATABASE_URL`
- `/root/memecache-cutover.dump`, the 2026-08-09 source dump

No configuration file, service, or other database was touched. `pg_hba.conf` was **not**
edited — `memecache_app` reaches the database through the existing
`host all all 127.0.0.1/32 md5` rule, which is exactly what a Phase 3 app on this box
needs.

## Before you start

The middleware blocker is **resolved** — see "The middleware problem" at the bottom for
what it was and which option was taken. Nothing else gates this runbook.

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

## 5. Point the app at it — DONE

`DATABASE_URL` in the app's `.env`, then restart. It is read at runtime, so this is a
restart and not a rebuild. No code change — `src/db/db.ts` already speaks the standard wire
protocol to either host.

The app itself now lives on this box. See the deployment section at the end.

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

### Resolved: middleware deleted, access token lengthened

Three options were on the table — an Edge-safe signature-only middleware with refresh moved
to a Node route, deleting middleware outright, or upgrading to Next 16 so middleware could
run on Node. **Deleting it won**, because it is the only one that makes the app smaller and
it closes two long-standing bugs rather than preserving them.

What changed:

- `src/middleware.ts` deleted.
- `src/components/MiddlewareValidator.tsx` deleted, along with the `middleware_run` cookie
  and the full-page `window.location.reload()` it triggered.
- Access token TTL raised from 15 minutes to 7 days, matching the refresh token, and the
  cookie `maxAge` now derives from the same constant. Those two previously disagreed: a
  15-minute cookie carrying a token middleware was supposed to refresh, so the browser
  dropped a still-valid session and the user appeared logged out.
- `refreshAccessToken()` and `handleTokenRefresh()` removed — nothing redeems a refresh
  token any more.
- `validateAccessToken()` now writes `lastActive` only when it is more than 5 minutes
  stale, instead of on every single request. `getOnlineUsers()` buckets to 15 minutes, so
  the resolution is ample.

Refresh tokens are still issued and still recorded, because logout deletes the row and that
is the hook a future "log out everywhere" would use.

**The tradeoff:** a stolen access token stays valid until it expires. Revocation is logout,
plus the role check in `validateAccessToken`, which still runs against the database on each
request. For an invite-only site with 15 accounts that is a fair trade. **If registration
ever opens to the public, revisit it** — the natural move then is option one, a
signature-only middleware with a Node refresh route.

---

## Deployment (Phase 3, done 2026-08-09)

The app runs on the Dallas box, same host as its database.

| | |
|---|---|
| Directory | `/root/memecache` |
| systemd unit | `memecache-nextjs` |
| Port | 3007 (loopback only; nginx fronts it) |
| nginx vhost | `/etc/nginx/sites-available/memecache.me` |
| TLS | Let's Encrypt, apex only (no `www` record exists), auto-renewing |
| Env | `/root/memecache/.env`, mode 0600 |
| Resident memory | ~45 MB at idle |

Conventions followed from the rest of the box: `ExecStart` runs the node binary directly
via `/usr/local/bin/node` rather than an `npm run start` wrapper, and the nvm path is not
hardcoded. `MemoryMax=768M` and `--max-old-space-size=512` are set because this host runs
on roughly 1.7 GiB available with Postgres serving nine databases and LiveKit alongside.
`OOMScoreAdjust=200` makes this app a more attractive kill target than the database.

`client_max_body_size 50m` in the vhost is load-bearing — nginx defaults to 1 MB, which
would reject the 30 MB video uploads at the proxy before the route ever ran.

The repository is public, so the box clones over HTTPS anonymously and no deploy key is
needed.

### Deploy loop

```bash
ssh dallas
cd /root/memecache && git pull --ff-only
npm ci                      # only when package-lock.json moved
NODE_OPTIONS="--max-old-space-size=1024" nice -n 19 npm run build
systemctl restart memecache-nextjs
```

`nice -n 19` matters: `next build` saturates all four cores and degrades in-progress
LiveKit calls, so avoid deploying during a scheduled DJ broadcast.

Verify with `systemctl is-active memecache-nextjs` and
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3007/`.

### Still open

- Confirm a `memecache` dump appears in the Chicago backup the morning after cutover.
- Decommission the Vercel project — it no longer receives traffic.
- Tear down Neon after a week.
