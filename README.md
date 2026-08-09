# MemeCache

Upload, store, tag and share memes. Next.js 14 App Router, Postgres, S3-compatible object
storage, hand-rolled JWT auth.

Live at [memecache.me](https://memecache.me). Registration is gated behind a shared access
code.

## Setup

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env    # then fill it in
npm run dev
```

Open http://localhost:3000.

**`.env` points at the production database and the production bucket.** There is no
separate development environment yet, so `npm run dev` reads and writes live data —
deleting a meme locally deletes it for everyone and purges the object from storage. Use a
throwaway upload when testing anything destructive.

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
db/               schema, migrations, and notes on both
```

**Identity always comes from the session.** Route handlers call `getUserFromAccessToken()`
and derive the acting user from the access token. No endpoint accepts a `userId` from the
request body; if you add one that does, that is a bug.

`src/auth/lib.ts` deliberately does **not** carry `'use server'`. That directive turns
every export in a file into a publicly callable endpoint, which is why the login, register
and logout actions live in `src/auth/actions.ts` on their own — nothing else belongs in
that file.

## Database

Schema, migrations, and a list of known schema problems are in [`db/README.md`](db/README.md).

To add a migration, drop a `NNN_name.sql` file in `db/migrations/` and run
`npm run db:migrate`. Each file runs once, inside a transaction, tracked in a `_migration`
table.

## Where the project is going

`TODO.md` holds the current plan: security fixes, then moving off Neon and Vercel onto
self-hosted Postgres and a VPS, then media to R2, then the product work. It is ordered
deliberately — the phases have dependencies.
