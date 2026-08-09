# MemeCache

A personal **meme library** — upload, tag, transcribe, and search the memes you collect, so you can actually find the right one again. Invite-only.

🔗 **Live:** [memecache.me](https://memecache.me)

![MemeCache — the Explore feed](docs/screenshot.jpg)

## What it does

- **Upload & organize** — drop in memes; images are compressed on upload and stored in S3.
- **Transcription** — memes carry their text, so the raw material for searching by what they *say* is there.
- **Tags** — tag memes and browse by tag (`/t/…`) to make a big collection searchable.
- **Explore & Library** — an Explore feed of shared memes and your own personal Library.
- **Accounts** — registration and login, gated behind a shared access code.

Search itself is not built yet, and it is the main gap — the transcriptions and tags are
the inputs to it. See [`TODO.md`](TODO.md), Phase 9a. Contribution scoring is likewise
planned rather than built.

## Tech stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) + React 18 |
| UI | React-Bootstrap + Sass, masonry layout |
| Auth | bcrypt + JWT (`jose`), no framework |
| Database | Postgres via `pg` |
| Storage | AWS S3 (`@aws-sdk/client-s3`) |
| Images | client-side compression (`browser-image-compression`) |

## Setup

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env    # then fill it in
npm run dev             # http://localhost:3000
```

Configuration lives in `.env` (not `.env.local`). `.env.example` lists every variable with
notes on what each is for.

**Be careful pointing a local `.env` at production.** There is no separate development
environment, so using the live database and bucket means `npm run dev` reads and writes
real data — deleting a meme locally deletes it for everyone and purges the object from
storage. Use a throwaway upload when testing anything destructive.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate:status` | List applied and pending migrations |
| `npm run db:migrate:dry` | Print the SQL that would run, change nothing |

## Layout

```
src/app/          routes; api/ holds the route handlers
src/auth/         lib.ts is server-only helpers, actions.ts is the three form actions
src/components/   shared UI
src/db/db.ts      the entire data layer, a single query helper
src/util/s3/      object storage
db/               schema, migrations, backups, and notes on all three
```

Two invariants worth knowing before changing anything under `src/`:

**Identity always comes from the session.** Route handlers call `getUserFromAccessToken()`
and derive the acting user from the access token. No endpoint accepts a `userId` from the
request body; if you add one that does, that is a bug.

**`src/auth/lib.ts` deliberately does not carry `'use server'`.** That directive turns every
export in a file into a publicly callable endpoint, which is why the login, register and
logout actions live alone in `src/auth/actions.ts`. Nothing else belongs in that file.

## Database

Schema, migrations, known schema problems, and backup notes are in
[`db/README.md`](db/README.md). The runbook for moving off Neon onto self-hosted Postgres
is [`db/MIGRATION.md`](db/MIGRATION.md).

To add a migration, drop a `NNN_name.sql` file in `db/migrations/` and run
`npm run db:migrate`. Each file runs once, inside a transaction, tracked in a `_migration`
table.

## Status

In active use (invite-only). [`TODO.md`](TODO.md) is the working plan — ordered
deliberately, since the phases have dependencies. Currently mid-migration from Neon and
Vercel onto self-hosted Postgres and a VPS.
