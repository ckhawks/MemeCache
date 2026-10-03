# Architecture plan

Written 2026-10-02. The goal is to pay down tech debt before building more features on
top of it. Product ideas live in `product-ideas.md` and known bugs in `known-bugs.md`.

The stack stays: Next.js, raw SQL on `pg`, S3-compatible storage, hand-rolled JWT auth,
the Dallas box. None of those is the problem at this size. The debt is in how the pieces
are wired together: SQL scattered across pages, three naming conventions in one schema,
two patterns for mutations, and a dev setup that points at production.

**Order:** 1, then 2 and 3 together, then 4, 6, 5. Step 7 grows alongside 3. Steps 1-4 are
roughly two or three focused sessions.

This supersedes the open items in TODO.md Phases 1, 6 and 8. Phase 4 (R2) is folded into
step 5 unchanged.

---

## 1. Local dev environment

`npm run dev` currently runs against the production database and bucket (see README).
Every later step is a refactor, so this comes first.

- [x] `docker-compose.yml` with Postgres 17 (matching Dallas) and SeaweedFS as a local
      S3-compatible bucket. MinIO was the plan, but it no longer publishes images.
- [x] Seed script (`scripts/seed.mjs`): apply `db/schema.sql` and migrations, load a sample
      of real data pulled read-only from production (`scripts/pull-sample.mjs`), upload its
      media. Falls back to two empty users without a sample.
- [x] `.env.example` defaults point at the local stack. Production credentials only ever
      live on the box.
- [x] README section on getting a working local copy.

Done 2026-10-03. When step 2 renames tables, `seed.mjs` and `pull-sample.mjs` change with
it, and the sample has to be pulled again.

## 2. Schema cleanup migration (002)

193 memes and 15 users. The data will never be smaller than it is now, so this is the
cheapest it will ever be to fix the shape.

- [ ] **One naming convention.** Unquoted snake_case everywhere: `meme`, `meme_id`,
      `created_at`. Postgres folds unquoted identifiers to lowercase, so snake_case is
      the convention that never needs quoting. Today there are three (see `db/README.md`
      problem 3).
- [ ] **Cascades.** `MemeTranscription.meme_id` has no `ON DELETE CASCADE`, so deleting a
      transcribed meme fails. Audit every FK onto `Meme` and `User` and decide cascade or
      restrict on purpose.
- [ ] **Unique `like(meme_id, user_id)`.** The like toggle relies on check-then-insert.
- [ ] **`tag.created_by`** gets filled in by the insert, or the column goes.
- [ ] **Caches: drop them.** `Cache` is one-per-user and `MemeCache` is one-per-meme, so the
      feature has no real behavior. Remove both tables, the cache dropdown on upload, the
      accordion on profiles and the dead `+ Cache` button. Collections can come back later
      as a real many-to-many feature if they are wanted.
- [ ] **Drop `RefreshToken`.** Tokens are issued but nothing redeems them since Phase 5.
      Stop issuing them in the same change.
- [ ] **Soft delete or not.** Phase 7 (DMCA) wants takedowns to hold content rather than
      purge it, so: use `deleted_at` on `meme`, filter it in the data layer, and drop the
      unused `deleted_at` on `like` and `user`.
- [ ] Leave `User.id` on uuid v1. Rewriting every FK to change it is not worth it. New
      tables use v4.

Renaming touches every query, which is why this ships together with step 3.

## 3. Data layer

SQL currently lives in page files and route handlers, results are `any`, and the count
bugs in `known-bugs.md` come from the same join being copy-pasted and edited.

- [ ] `src/db/queries/` with one module per area: `memes.ts`, `tags.ts`, `users.ts`,
      `likes.ts`, `transcriptions.ts`. Plain functions returning typed rows.
- [ ] Pages, server actions and route handlers call those functions and contain no SQL.
- [ ] Feed and detail counts computed with subqueries or `LATERAL`, never by joining
      `like` and `meme_tag_vote` in the same `FROM`. Fixes the fan-out bugs once.
- [ ] Counts converted to `number` in this layer. The int8-as-string behavior noted in
      `src/db/db.ts` stops leaking into components.
- [ ] Pagination built into the feed queries from the start (keyset on `created_at, id`),
      newest first in SQL instead of reversed on the client.
- [ ] Stay on raw SQL. If schema-derived types become worth it later, Kysely with
      `kysely-codegen` is the light option. No Prisma or Drizzle.

## 4. One mutation pattern

Today there are API routes, server actions, and several `// change this to be a server
action` comments.

- [ ] **Server actions** for every UI write: like, add tag, vote, transcription, delete,
      avatar, profile edits. Each one reads the user from the session and validates input
      with zod.
- [ ] **Route handlers** only where something needs a URL: upload (until presigned
      uploads in step 5), media (until the CDN), OG data.
- [ ] `notFound()` for missing memes, users and tags instead of crashing on `undefined`.
- [ ] One error shape for actions, so the UI can show a message instead of failing
      silently.
- [ ] Remove the `/api/management` one-off script.

## 5. Media pipeline

- [ ] TODO.md Phase 4 as written: R2, `cdn.memecache.me`, retire `/api/resource`, presigned
      uploads. The CDN serves Range requests, which fixes video seeking and iOS playback.
- [ ] Post-upload processing, inline in the request: thumbnail via `sharp`, poster frame
      for video via `ffmpeg`, and store width, height and a perceptual hash on the row.
- [ ] Feeds render thumbnails with `loading="lazy"`. Videos in the feed show the poster
      with `preload="none"`. The original only loads on the detail page.
- [ ] Backfill script that runs the same processing over existing memes.
- [ ] No queue and no Redis. At this volume inline is fine. Slower enrichment later (vision
      labels for search) gets a `processed_at` column and a small cron script.

## 6. Framework and UI

- [ ] Upgrade Next 14 to the current major and React 19. The 5 remaining high advisories
      only clear on that upgrade, and it changes route params and caching defaults. Do it
      right after step 3, when there is less code to touch.
- [ ] Drop Bootstrap (TODO.md Phase 6) in the same pass. Usage is shallow: `Button`,
      `Form`, `Row`/`Col`, `Image`, one `Modal`.
- [ ] `<Link>` for gallery cards instead of `window.location.href`, responsive masonry
      columns.
- [ ] Set `metadataBase` so OG and Twitter preview URLs are absolute.
- [ ] Replace the hand-rolled timezone offset in `datetimeFormat.ts` with `Intl` and render
      dates in one place to avoid hydration mismatches.

## 7. Safety net

- [ ] Confirm the CI workflow in `.github/workflows/ci.yml` actually runs. It never has.
- [ ] Vitest tests for the data-layer functions against the docker Postgres. These are the
      most likely thing to break during the rename.
- [ ] Unit tests for pure helpers as they appear (validation, slugging, hashing).
- [ ] No UI or end-to-end tests yet.
- [ ] Optional: build in CI and ship Next's `standalone` output to the box. `next build`
      on-box saturates all 4 cores and degrades LiveKit calls (TODO.md Phase 3).

---

## Deliberately not doing

- **An ORM.** Raw SQL in one module is enough.
- **A queue, Redis or background workers.** Inline processing plus cron covers it.
- **Swapping auth for a library.** The hand-rolled JWT is adequate for an invite-only site
  with 15 users. Revisit if registration opens (see TODO.md Phase 5 tradeoff).
- **A separate API service or monorepo.**
- **Rewriting `User.id` to uuid v4.**
