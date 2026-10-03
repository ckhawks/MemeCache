# Known bugs

Found in a code survey on 2026-10-02. Line numbers are as of commit `3e4b298`. Many of
these go away as part of `architecture-plan.md`; the step that fixes each one is noted.

## Data loss or broken features

- **Deleting a transcribed meme loses the file and keeps the row.** `delete/route.ts:43`
  deletes the S3 object, then line 44 deletes the row. `MemeTranscription.meme_id` has no
  `ON DELETE CASCADE` (`db/schema.sql:432`), so the row delete fails after the file is
  already gone. Plan step 2 (cascade) and step 4 (delete the row first, then the object).
- **Tag voting never renders.** `TagChip.tsx:37` shows the arrows only when `disableVote`
  is true, which is inverted. `MemeTagsEditor.tsx:36` fetches tags without the user, so
  `own` is always false. The arrows sit inside a `<Link>` and call `stopPropagation` but
  not `preventDefault`, so a click would also navigate. Plan step 4.
- **Video seeking and iOS Safari playback.** `/api/resource/[memeId]` ignores `Range`
  and always returns 200 with the full body. Plan step 5 (CDN).
- **Link previews likely broken since self-hosting.** `metadataBase` is not set and OG
  image URLs are relative. `generateMetadata` also fetches the app's own API over HTTP
  (`meme/[memeId]/page.tsx:106`). Plan step 6.

## Wrong numbers

- `/t/[tagName]` joins `MemeTagVote` and `Like` in the same query
  (`t/[tagName]/page.tsx:64,68`), so like counts and tag scores multiply each other.
- The tags GET joins `MemeTag` (one row per adder) against votes (`tags/route.ts:31-32`),
  so a tag added by two users shows double its score.
- `api/meme/[memeId]` joins every transcription row (`route.ts:32-35`), takes `[0]`
  arbitrarily and multiplies `likeCount`.

All plan step 3.

## Crashes

- Missing meme ID passes `undefined` into `MemeDetailsLarge` (`meme/[memeId]/page.tsx:74`).
  Plan step 4.
- Upload crashes for a user with no cache (`UploadComponent.tsx:149`). Plan step 2.
- Transcription POST for a nonexistent meme returns a 500 from the FK failure
  (`transcription/route.ts:77`). Plan step 4.

## Permissions and UI

- Moderators get no delete button although the API allows them (`GalleryMasonry.tsx:66`,
  `MemeDetailsLarge.tsx:29`).
- The cache Edit control shows on every profile because `isCurrentUser` is passed as a bare
  `true` (`me/[username]/page.tsx:182`). Goes away with caches in plan step 2.
- After deleting a meme the grid does not refresh (`DeleteMemeButton.tsx:35-39`), and
  `onHide={() => handleClose}` (line 59) never calls `handleClose`.
- Logged-out like clicks do nothing with no feedback (`LikeButton.tsx:17`).
- Tags GET takes the user from the query string (`tags/route.ts:14`), against the
  identity-from-session rule.
- Avatar lookup is case-sensitive (`avatar/[username]/route.ts:18`) and the default avatar
  response has no caching or error handling (lines 36-51).
- Footer "Content Policy" links to `/` (`FooterBar.tsx:22-29`).
- The profile edit page returns a bare 404 without layout for non-owners
  (`edit/page.tsx:74-80`).

## Performance

- Explore and library load every meme, full size, with no lazy loading. Plan steps 3 and 5.
- Gallery uses a hardcoded 3 columns and full-page navigation (`GalleryMasonry.tsx:36,49`).
  Plan step 6.
- Compression failure on upload is swallowed and the original is sent
  (`UploadComponent.tsx:103-105`), and a `console.log` runs on every render (line 152).

## Minor

- `datetimeFormat.ts:19` hardcodes a -5h offset and mutates its input. Plan step 6.
- The home page runs `SELECT * FROM "User"`, password hashes included, to render
  usernames (`page.tsx:12`). Server-only, so nothing leaks, but it should select only
  what it renders.
