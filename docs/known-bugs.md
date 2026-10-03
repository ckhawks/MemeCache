# Known bugs

Found in a code survey on 2026-10-02. Line numbers are as of commit `3e4b298`. Many of
these go away as part of `architecture-plan.md`; the step that fixes each one is noted.

## Fixed 2026-10-03 (plan steps 2 and 3)

- Deleting a transcribed meme lost the file and kept the row. Deletes are now soft.
- Tag voting never rendered: inverted arrow condition, `own` always false, and a vote
  click also navigated.
- Like counts and tag scores multiplied each other on `/t/[tagName]`, a tag added by two
  users showed double its score, and `api/meme/[memeId]` multiplied `likeCount`.
- A missing or malformed meme id crashed the detail page. It is now a 404.
- Upload crashed for a user with no cache. Caches are gone.
- Transcription POST for a nonexistent meme returned a 500.
- The cache Edit control showed on every profile.
- Tags GET took the user from the query string.
- Avatar lookup was case-sensitive.
- The home page selected every user column, password hashes included.
- `generateMetadata` fetched the app's own API over HTTP.
- New in this pass: `/api/users/online` returned every online user's email address to
  anyone, and `/api/resource/<key>` served any key in the bucket, including deleted memes.

## Data loss or broken features

- **Video seeking and iOS Safari playback.** `/api/resource/[memeId]` ignores `Range`
  and always returns 200 with the full body. Plan step 5 (CDN).
- **Link previews likely broken since self-hosting.** `metadataBase` is not set and OG
  image URLs are relative. Plan step 6.

## Permissions and UI

- Moderators get no delete button although the API allows them (`GalleryMasonry.tsx:66`,
  `MemeDetailsLarge.tsx:29`).
- After deleting a meme the grid does not refresh (`DeleteMemeButton.tsx:35-39`), and
  `onHide={() => handleClose}` (line 59) never calls `handleClose`.
- Logged-out like clicks do nothing with no feedback (`LikeButton.tsx:17`).
- The default avatar response has no caching or error handling
  (`avatar/[username]/route.ts`).
- Footer "Content Policy" links to `/` (`FooterBar.tsx:22-29`).
- The profile edit page returns a bare 404 without layout for non-owners
  (`edit/page.tsx:74-80`).

## Performance

- Feeds load 60 memes per page, but full size with no lazy loading. Plan step 5.
- Gallery uses a hardcoded 3 columns and full-page navigation (`GalleryMasonry.tsx:36,49`).
  Plan step 6.
- Compression failure on upload is swallowed and the original is sent
  (`UploadComponent.tsx:103-105`), and a `console.log` runs on every render (line 152).

## Minor

- `datetimeFormat.ts:19` hardcodes a -5h offset and mutates its input. Plan step 6.
