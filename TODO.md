# MemeCache TODO

Ordered plan for picking the project back up (assessed 2026-08-09, last commit 2025-10-06).
Phases 0-4 are sequenced deliberately; later phases are a backlog.

Target infrastructure:

- **Postgres** — Dallas box `extravm-puckvps-1` (216.146.25.22), port **7465** (not 5432),
  one database + one role per project, backed up nightly to Chicago.
- **App** — systemd unit on the same box behind nginx. That box has 5.7Gi RAM with ~1.9Gi
  available and 800Mi already in swap, so this app needs an explicit memory cap.
- **Media** — Cloudflare R2 (S3-compatible, zero egress) behind a custom domain.

---

## Phase 0 — Security fixes — DONE 2026-08-09, not yet deployed

Ship these to the current Vercel deployment before starting the migration.

The whole set follows one rule: **identity comes from the session, never from the request
body.** Every route that took a `userId` field now ignores it, and the clients no longer
send one.

- [x] **`/api/upload` had no authentication at all.** It read `userId` and `cacheId` from the
      form body and never called `getUserFromAccessToken()`. Anyone could upload to the
      bucket as any user, into any cache. Now requires a session, takes the uploader from
      it, and verifies the caller owns `cacheId`.
- [x] **`/api/upload` had no server-side file validation.** MIME and size are now enforced
      against `constants/mimeTypes.ts` (4MB images, 30MB video) instead of only in
      `UploadComponent.tsx`. Also added S3 cleanup when the DB insert fails after the
      object is already written — previously that left an orphan no row referenced.
- [x] **`/api/meme/delete` never checked meme ownership.** It confirmed the caller was who
      they claimed, then deleted whatever `memeId` it was handed, so any logged-in user
      could delete anyone's meme. Now checks `uploaderUserId`, with moderators allowed.
- [x] Same class of bug audited across the other routes: `/api/like` and `/api/user/avatar`
      now derive identity from the session, and the avatar route gained the MIME and 2MB
      checks its TODOs had been asking for.
- [x] Tags and transcription hardened: tag names capped at 50 chars, transcriptions at
      5000, a client-supplied `tagId` is checked against the `Tag` table before insert, and
      transcription no longer accepts an `edited_by` field at all.
- [x] **Removed `'use server'` from `src/auth/lib.ts`.** It had been exposing every export
      as a public endpoint, including `validateAccessToken`, `refreshAccessToken`,
      `changeUserRole` and `updateUserActivity(userId)`. The three real form actions
      (`login`, `register`, `logout`) moved to `src/auth/actions.ts`.
- [x] Deleted the dead `encrypt`/`decrypt` pair that signed with `process.env.JWT_SECRET`,
      which is absent from `.env` and so resolved to the literal string `"undefined"`.
- [x] Deleted `changeUserRole` / `updateUserRole` / `invalidateUserTokens`. **Note:** this
      removes the only role-change code in the repo. It was never wired to a route and
      nothing imported it, but if you want an admin role UI later it needs rewriting.
- [x] Deleted `src/auth/lib copy.ts`, `middlewareOld`, `middlewareTemp`,
      `handleTokenRefreshOld`.
- [x] Dependencies: `bcrypt` 5.1.1 to 6.0.0 (drops the whole `node-pre-gyp` chain),
      `@aws-sdk/client-s3` to 3.1106.0, Next pinned to 14.2.35. **37 advisories (3 critical,
      16 high) down to 5 high**, all of which are inside Next's own `postcss`/`glob` tree
      and only clear on the Next 16 major — leave them until the migration.
      bcrypt 6 keeps the `$2b$` format, verified by re-deriving a hash from its own
      embedded salt, so existing password hashes still validate.

## Phase 1 — Make the project reproducible

Prerequisite for the migration. Right now the database shape exists only inside the Neon
instance and in query string literals; nothing has ever been committed.

- [x] `pg_dump --schema-only` from Neon into `db/schema.sql` and commit it. **Done
      2026-08-09.** Findings are written up in `db/README.md`; the ones that change other
      phases are listed below.
- [x] Add a lightweight migration runner and an initial migration. **Done 2026-08-09.**
      `scripts/migrate.mjs` applies `db/migrations/*.sql` once each, in a transaction,
      tracked in a `_migration` table. `npm run db:migrate`, `:status`, `:dry`.
      Migration `001` adds the missing indexes and the case-insensitive unique indexes.
      Verified end to end against a throwaway local Postgres: `db/schema.sql` restores
      into an empty database, `001` applies and is idempotent, and the new
      `user_username_lower_key` correctly rejects `Alice` against an existing `alice`.
- [ ] **Migration 001 has not been applied to the live database yet.** It cannot be, with
      the current credentials — see the role note in Phase 2. Apply it during the Dallas
      restore, or grant CREATE first if you want the index speedup on Neon before then.
- [ ] ~~Add `Meme.status`~~ — not needed. `deletedAt` columns **already exist** on `Meme`,
      `Like` and `User` and are simply never used. Phase 7 soft delete is a code change,
      not a schema change.
- [ ] **Add the missing indexes.** The database has no explicit `CREATE INDEX` at all —
      only what primary keys and unique constraints imply. Every feed query joins
      `Like` on `"memeId"`, which is unindexed and sequentially scanned. Same for
      `Meme."uploaderUserId"`, `MemeTranscription.meme_id`, and `MemeTag.tagid` /
      `MemeTagVote.tagid` (the composite PKs lead with `memeid`, so the `tagid` lookup
      that `/t/[tagName]` depends on has no index).
- [ ] **Decide what caches are.** `Cache` has `UNIQUE ("ownerUserId")`, so a user can only
      ever have one — which is why "create cache" was never built and why the `+ Cache`
      button does nothing. `MemeCache` has `UNIQUE ("memeId")`, so a meme lives in exactly
      one cache despite the join-table shape. Either drop both constraints and finish the
      feature, or accept one-cache-per-user and remove the dead UI. Ties to Phase 9g.
- [ ] Install the `uuid-ossp` extension on the Dallas database before restoring.
- [x] Add `.env.example`. **Done 2026-08-09.**
- [x] Rewrite `README.md` as real setup instructions. **Done 2026-08-09.** Includes the
      warning that `npm run dev` runs against the production database and bucket.
- [ ] Delete dead code: `src/auth/lib copy.ts`, `middlewareOld`, `middlewareTemp`,
      `handleTokenRefreshOld`, and the commented-out query blocks in most page files.
- [ ] Normalize SQL identifier casing. The dump confirms **three** conventions in one
      database: quoted camelCase on `Meme`/`Like`/`Cache`/`User`/`MemeCache`/`RefreshToken`,
      unquoted lowercase on `MemeTag`/`MemeTagVote`/`Tag`, and snake_case on
      `MemeTranscription`. Query code has to match each exactly, which is why the tag
      queries look inconsistent — they are correct, just for a differently-named table.
- [x] Add a GitHub Action running `tsc --noEmit`, `next lint` and `next build`.
      **Done 2026-08-09**, `.github/workflows/ci.yml`. Untested — it has never run,
      since nothing has been pushed yet.

## Phase 2 — Neon to Dallas Postgres

The entire database layer is the 8-line `db()` helper in `src/db/db.ts`, which makes this
much smaller than it sounds.

- [ ] Create the `memecache` database and role on Dallas Postgres (port 7465), plus the
      `uuid-ossp` extension. **Give the app a least-privilege role** — see below.
- [ ] **The app currently connects to Neon as `test_owner`, a member of `neon_superuser`
      holding `pg_read_all_data` and `pg_write_all_data`.** The tables are owned by a
      different role, `memecache-api`. So the web application's database credentials are
      effectively superuser, which is the wrong shape for a public-facing app and should
      not be reproduced on Dallas. The new role wants `CONNECT`, `USAGE` on `public`, and
      `SELECT`/`INSERT`/`UPDATE`/`DELETE` on the app tables — nothing more.
- [ ] Note: despite those privileges, `test_owner` has **no `CREATE` on schema `public`**
      (the Postgres 15+ default), which is why `npm run db:migrate` fails against Neon
      with `permission denied for schema public`. Not worth fixing on Neon if the move is
      imminent — apply migration 001 during the restore instead.
- [x] Replace `@neondatabase/serverless` with `pg`. **Done 2026-08-09.** Verified by
      running the app's real queries through both drivers and comparing row counts,
      per-column types and serialised values — the `/explore` feed query, a `COUNT`, a
      `SUM`, a timestamp-bearing user row and an empty result. All five byte-identical.
- [x] One shared `Pool` at module scope, cached on `globalThis` so Next's dev-server hot
      reload does not leak a pool per reload. The old code built a fresh client per call.
- [x] Externalise `pg-native` in `next.config.mjs` alongside `bcrypt`.
- [ ] Remove `@neondatabase/serverless` from `package.json` once the cutover is done and
      there is no chance of needing to point back at Neon.
- [ ] `pg_dump` the data from Neon, restore to Dallas, verify row counts per table.
- [ ] Confirm the nightly Chicago backup picks up the new database. The `pg_hba` rule is
      `host all user_does_backups <ip>/32 md5` and `user_does_backups` holds cluster-level
      `pg_read_all_data`, so it should be automatic — but verify rather than assume, since
      `pg_hba.conf` is per-database per-host and that is the thing that bites.
- [ ] Keep the Neon instance alive read-only for a week before tearing it down.

## Phase 3 — Vercel to the Dallas VPS

Follow the conventions already established on that box (see the puckstats deploy loop).

- [ ] Register a passphrase-less **read-only deploy key** for this repo plus a
      `Host github-memecache` alias in `/root/.ssh/config`. The box's existing
      `id_ed25519` is passphrase-protected, so non-interactive `git pull` fails with
      `Permission denied (publickey)` — which looks identical to an unregistered key.
      A GitHub deploy key works on exactly one repo, so it must be a new one.
- [ ] Pick a port. 3000 is puckstats, 38517 is os-tracker.
- [ ] systemd unit `memecache-nextjs`. `ExecStart` a node binary directly via
      `/usr/local/bin/node` — do not wrap in `npm run start`, and do not hardcode the nvm
      path. Both are settled conventions on that box as of 2026-08-09.
- [ ] Set `MemoryMax` and `--max-old-space-size`. Default Node heap ceiling is ~2GB per
      process and the box is already 800Mi into swap.
- [ ] nginx vhost for `memecache.me` + TLS. Note `caddy.service` fails on every boot there
      and is harmless; nginx is the front end.
- [ ] Builds run on-box with `nice -n 19`. `next build` saturates all 4 cores and degrades
      in-progress LiveKit calls, so avoid deploying during a scheduled DJ broadcast.
- [ ] Verify middleware behaves the same self-hosted as it did on Vercel's edge runtime.
- [ ] DNS cutover, then decommission the Vercel project.

## Phase 4 — S3 to Cloudflare R2

Chosen over staying on AWS because a meme host is egress-heavy and storage-light, and R2
charges nothing for egress. Also fixes the geography problem the VPS move creates: compute
in Dallas reading a `us-west-1` bucket, streamed through Node.

- [ ] Point `src/util/s3/GetS3Client.ts` at R2 — `endpoint`, `region: 'auto'`, new
      credentials. `@aws-sdk/client-s3` stays; `GetFileForMeme.ts`,
      `DeleteS3ObjectByKey.ts`, and both upload routes are untouched.
- [ ] `rclone sync` existing objects from S3 to R2 (or Cloudflare Super Slurper).
- [ ] Attach `cdn.memecache.me` to the bucket.
- [ ] Point media `src` attributes at the CDN domain and retire the
      `/api/resource/[memeId]` streaming route. Objects are UUID-keyed and immutable and
      already carry `max-age=31536000, immutable`, so they cache perfectly. This also
      removes the origin bandwidth bottleneck.
- [ ] Keep the S3 bucket read-only for a week, then delete.
- [ ] Presigned URLs for upload so files skip the origin entirely.

## Phase 5 — Fix the session model — DONE 2026-08-09, folded into Phase 2

Phase 2 forced this early. Swapping to `pg` broke the build: `middleware.ts` runs in the
Edge Runtime and transitively imported the driver, and the Edge Runtime has no TCP sockets.
The Neon HTTP driver was the only reason it ever worked, and self-hosted Postgres removes
that option.

All three bugs shared one root cause. The 15-minute access token was refreshed by
middleware, which set the new cookie on the **response** while the server component read
the **request** — so the refresh never helped the render that triggered it, and the cookie
`maxAge` expired at 15 minutes regardless.

- [x] ~~Forward the refreshed cookie onto the request~~ — moot, there is no refresh.
- [x] Deleted `middleware.ts`, `MiddlewareValidator.tsx`, and the `middleware_run` cookie.
- [x] Access token TTL 15 minutes to 7 days, matching the refresh token; the cookie
      `maxAge` now derives from the same constant so the two cannot drift apart again.
- [x] `validateAccessToken` writes `lastActive` only when it is over 5 minutes stale
      instead of on every request. The role check stays on the request path — with no
      short expiry, it is the main way a session goes invalid before logout.
- [x] Closes: "fix random sign outs", "fix first load not having session on SSR".

**Tradeoff accepted:** a stolen access token stays valid until it expires. Fine for 15
invite-only accounts. If registration ever opens, revisit — the move then is a
signature-only Edge middleware plus a Node refresh route. Written up in `db/MIGRATION.md`.

## Phase 6 — Drop Bootstrap

Usage is shallow: `Button`, `Form`, `Row`/`Col`, `Image`, and one `Modal`. The existing
SCSS modules already carry the design and the light/dark theme. Removing Bootstrap is a
prerequisite for any replacement, so it happens first regardless of what comes after.

- [ ] Replace `Button`/`Form`/`Row`/`Col` with plain elements plus the existing styles.
- [ ] Replace the `Modal` in `DeleteMemeButton.tsx` with a native `<dialog>`.
- [ ] Replace `react-bootstrap`'s `Image` with `next/image` (also clears the two build
      warnings at `NavigationBar.tsx:95`).
- [ ] Remove the global `bootstrap/dist/css/bootstrap.min.css` import from `layout.tsx`.
- [ ] Optional, later and separately: Tailwind + shadcn for a visual refresh. Do not
      combine this with the migration.

## Phase 7 — DMCA and moderation

Enough for a small invite-gated host. The realistic risk is not a lawsuit, it is a
complaint to Cloudflare or the registrar taking the site down.

- [ ] Register a designated agent at dmca.copyright.gov (~$6). This is the step that
      actually establishes §512(c) safe harbor; a contact page alone does not.
- [ ] Static `/dmca` page linked in the footer: what a valid notice must contain, the
      agent's published contact, and the counter-notice process.
- [ ] Repeat-infringer termination policy, stated on that page.
- [ ] Use the `Meme.status` column from Phase 1 so takedowns hold content instead of
      hard-deleting the row and purging the object.
- [ ] Later, if volume justifies it: a notice submission form, a `DmcaNotice` table, and an
      admin queue. Email is fine at current volume.

## Phase 8 — Performance and correctness

- [ ] Pagination / infinite scroll on `/explore` and `/library`. Both currently select every
      meme with a `LEFT JOIN "Like"` and aggregate. This blocks everything as content grows.
      (Was: "large feed".)
- [ ] The home page does `SELECT * FROM "User"` and renders the full list — replace with a
      real landing page. It still says "almost none of the above functionality exists".
- [ ] Enforce username rules in the database, not just in `register`: alphanumeric only, and
      a case-insensitive unique constraint. The dump confirms `User.username` and `Tag.name`
      carry plain case-**sensitive** `UNIQUE` constraints while the code checks with
      `LOWER(...)`, so the check-then-insert is racy and a direct insert bypasses it. No
      collisions exist today (verified 2026-08-09). Fix is a unique index on
      `LOWER(username)` and `LOWER(name)`.
      (Was: "prevent two users from having same username with different casing",
      "limit username to only alphanumeric".)
- [ ] Give `RefreshToken."userId"` the `uuid` type and a foreign key. It is `character
      varying` with no FK, so deleting a user orphans their tokens.

## Phase 9 — Product

The ordering in this section matters more than the individual items. The project has
shipped the *inputs* to a search product (transcriptions, voted tags) without the search
itself, and the *storage* half of "store and share" without the sharing ergonomics.
Those two gaps are where the leverage is.

### 9a. Search — the missing product

Transcription text and voted tags currently do nothing for the user; only the tag page
reads them. Contributing a transcription gives the contributor nothing back. Search
retroactively makes two already-built features worth having.

- [ ] Postgres full-text search over transcription + tag names + cache name + uploader.
      `tsvector` column, GIN index, `pg_trgm` for fuzzy matching. No new infrastructure,
      free on the Dallas box. (Was: "fuzzy search (transcription + tags)".)
- [ ] **Auto-transcription via OCR at upload.** Search quality is a function of coverage,
      and manual transcription will never get there. Pre-fill the field and let humans
      correct rather than author — a much lower-friction ask that keeps the contribution
      mechanic intact. Tesseract runs free on-box; a vision model handles stylized meme
      text far better for a fraction of a cent per upload.

### 9b. Sharing — the actual atomic action

The only exit path today is the download button.

- [ ] Copy-link and copy-image buttons on the meme card and detail page
      (`navigator.clipboard.write()` with a blob for the image case).
- [ ] **Mobile.** `GalleryMasonry.tsx:47` hardcodes `breakpointCols={3}` with the
      responsive config commented out directly below it. A shared link currently opens to
      a three-column masonry on a 390px screen.
- [ ] PWA with a **Web Share Target**, once mobile works. See a meme in Discord on
      Android, hit share, pick MemeCache, done. Turns uploading from a deliberate desktop
      task into a reflex — upload friction is the whole ballgame for an archive product.

### 9c. Onboarding

- [ ] Multi-file drag-and-drop upload with a queue. A new user with 800 memes in a folder
      currently faces a single `<input type="file">`, one at a time. Without this, every
      new library starts empty and stays that way.

### 9d. Contains-AI flag

Worth designing rather than shipping a plain boolean: people uploading AI content are the
least likely to self-flag, so an uploader-only field would stay mostly empty and mean
nothing.

- [ ] `Meme.aiStatus`: `unknown | human | ai`, defaulting to `unknown`.
- [ ] Uploader sets it at upload time as a hint, not the final word.
- [ ] Any logged-in user can flag a meme as AI-generated. Reuse the pattern already built
      for tag voting rather than inventing a second adjudication mechanism — a threshold
      of net flags flips `aiStatus`, and a moderator can pin it.
- [ ] Per-user display preference: show / blur / hide AI-flagged memes in all feeds.
- [ ] Filterable in search and on `/explore` once 9a lands.
- [ ] Consider surfacing it as a corner badge on the card rather than a full overlay, so
      it informs without dominating the grid.

### 9e. Duplicate detection

Core to a product named *cache*, and increasingly necessary once bulk upload lands.

- [ ] Perceptual hash at upload. Warn "you already have this one" on a near match.
- [ ] Community surface: "4 other people have this meme" — free discovery, and fun.

### 9f. Retention — cheap version first

- [ ] Discord webhook posting new uploads. Roughly twenty lines, and for a community this
      size it will likely outperform both notifications and following, which are each real
      work. Ship this before deciding whether the appetite for those survives.

### 9g. Finish or cut caches

- [ ] `me/[username]/page.tsx` renders a `+ Cache` button with no click handler, while
      create/edit/delete sit in the Low backlog. A visible dead button is worse than no
      button. Either promote cache management or remove the control until it works.

### 9h. Discovery

- [ ] `/explore` is every meme ever, reverse-chronological, unpaginated. Once pagination
      lands in Phase 8: "top this week", random, and tag browsing. Any of them beats an
      infinite chronological wall. (Was: "randomize explore".)

---

# Feature backlog

## High

- meme view count (needs redis — Dallas has Redis on port **5676**, non-standard)
- meme download count (needs redis)
- notifications (who liked your posts) — see Phase 9f first
- add transcription history viewer (moderation)
- add categorization queue (own or global)
  - score based on having transcription and having >5 tags
- confirmation email

## Medium

- profile bio
- add contribution score to profile (transcription = 5 pts, each new tag = 2pts, rate tag = 1pt)
- view likes
- follow tag
- following feed
- upload from social media
- add application process (3 memes)
- new logo
- comments on memes
- profile blurbs

## Low

- transcription guidelines
- follow profile
- follow cache
- create cache
- edit cache
- delete cache
- forgot password
- change username
- invite collaborators

## Done

- change profile picture
- optimize images on upload (might have to happen from the client)
- add download button
- add opengraph metadata
- add transcription
- add tags
