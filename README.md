# MemeCache

A personal **meme library** — upload, tag, transcribe, and search the memes you collect, so you can actually find the right one again. Invite-only.

🔗 **Live:** [memecache.me](https://memecache.me)

![MemeCache — the Explore feed](docs/screenshot.jpg)

## What it does

- **Upload & organize** — drop in memes; images are compressed on upload and stored in S3.
- **Transcription** — memes carry their text so you can search by what they *say*, not just tags.
- **Tags** — tag memes and browse by tag (`/t/…`) to make a big collection searchable.
- **Explore & Library** — an Explore feed of shared memes and your own personal Library.
- **Accounts** — registration/login with contribution scoring for transcribing and tagging.

## Tech stack

| | |
|---|---|
| Framework | Next.js (App Router) + React |
| UI | React-Bootstrap + Sass, masonry layout |
| Auth | bcrypt + JWT (`jose`) |
| Database | Postgres ([Neon serverless](https://neon.tech/)) |
| Storage | AWS S3 (`@aws-sdk/client-s3`) |
| Images | client-side compression (`browser-image-compression`) |

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Requires a Postgres connection string (Neon), AWS S3 credentials, and a JWT secret — set them in `.env.local` before running.

## Status

In active use (invite-only). See [`TODO.md`](TODO.md) for the working feature backlog.
