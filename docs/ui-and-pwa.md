# UI pass and PWA

Written 2026-10-03, from screenshots of the current site at 1440px and 390px. Builds on
`architecture-plan.md`: phase A can ship now, phase B rides along with step 6 (Next 15,
dropping Bootstrap) so nothing gets restyled twice. Replaces TODO.md 9b's "Mobile" and
"PWA with a Web Share Target" items.

The goal is the product's core job on a phone: get the right meme into a conversation in
as few taps as possible, and get a meme you just saw into the cache just as fast.

---

## What is wrong today

Desktop is in reasonable shape. Phone is not:

- **The page scrolls sideways.** Nav, content and footer all carry a fixed `4rem` side
  padding at every width, so at 390px the "Explore" heading is cut off on the left.
- **The nav runs off the screen.** Five links plus logo, logout and the user chip in one
  row; "Library" is clipped and nothing past it is reachable.
- **The gallery is three columns at any width** (`GalleryMasonry.tsx`, `breakpointCols={3}`,
  with the responsive version commented out). Cards are about 110px wide and the date
  wraps onto three lines.
- **The home page is a placeholder**: "heavily under construction" and a list of every
  user.

On every size:

- The meme page fetches tags and transcription after load, so it shows "Loading..." and
  "No tags." at the same time before filling in.
- Cards navigate with `window.location.href`, a full page load per click.
- There is no way to send a meme anywhere except downloading it.

## Platform facts that shape the plan

- **Android (Chrome)** can install the site and, with a Web Share Target in the manifest,
  list MemeCache in the system share sheet. "Share from Discord, pick MemeCache" uploads.
- **iOS (Safari)** supports "Add to Home Screen" and runs the app full-screen, but has no
  share target and no install prompt. Uploading by sharing in is Android-only.
- **Both** support the Web Share API with files: a Send button can hand the actual image
  to the share sheet, straight into iMessage or Discord. This is the single biggest win
  for the core job, and it works without installing anything.
- A share target POST is a navigation the OS starts. The session cookie is
  `SameSite=Strict`, which a cross-site navigation does not carry, so the share target is
  handled by the service worker: it holds the file and opens `/upload`, where the normal
  logged-in upload runs.

## Phase A: mobile works, and it installs (now)

1. [ ] **Responsive layout.** Side padding scales down (`1rem` on phones). Gallery columns:
       1 under 600px, 2 under 1000px, 3 above. No horizontal scroll anywhere at 360px.
2. [ ] **Phone navigation.** Top bar keeps the logo and the user chip. Explore, Library,
       Upload and Profile move to a fixed bottom tab bar under 700px, the thumb-reachable
       place every phone app uses. Log out moves to the profile page on phones.
3. [ ] **Send button** on every card and the meme page: `navigator.share({ files })` with
       the meme itself, falling back to copying the link where file sharing is not
       supported (most desktops).
4. [ ] **Manifest and icons.** `app/manifest.ts`, generated PNG icons (192, 512, maskable,
       Apple touch icon) via `next/og` so there are no binary assets to maintain until
       there is a real logo (TODO.md backlog "new logo"). `display: standalone`, theme
       colors for light and dark.
5. [ ] **Service worker**, deliberately small: the share-target handler and an offline page.
       No caching of memes or pages, which would only serve stale feeds.
6. [ ] **Share target.** Manifest `share_target` accepting images and video; the worker
       stores the shared file and opens `/upload?shared=1`, which picks it up and shows
       the normal preview and Upload button.

Done 2026-10-03. Checked in a 390px browser: one column, tab bar, no sideways scroll,
manifest and icons served. Not yet checked on real devices: install, the Android share
target, and Send into iMessage. The service worker only registers in production builds.

## Phase B: design pass (with architecture step 6)

7. [ ] Drop Bootstrap and restyle on the existing SCSS variables (step 6 already plans
       this). The delete modal becomes a native `<dialog>`.
8. [ ] Cards as real `<Link>`s, so navigation is client-side and middle-click works.
9. [ ] The meme page renders tags and transcription on the server. No loading flash, and
       link previews get the transcription for free.
10. [ ] A real home page: for logged-in users, a "recent" strip and their most-sent memes
        (product-ideas section 2); for visitors, what MemeCache is and a login button.
        The user list goes.
11. [ ] Feed polish: lazy-loaded thumbnails once step 5 produces them, a consistent card
        footer, and infinite scroll replacing the "Older memes" link.
12. [ ] Fix the remaining items in `known-bugs.md` under "Permissions and UI".

Phase A is one to two sessions. Phase B is mostly folded into step 6's estimate.

## How to check it

- Chrome DevTools device mode at 360px and 390px: no sideways scroll, every page reachable
  from the tab bar.
- Lighthouse "installable" passes.
- On a real Android phone: install, share an image from another app, land on Upload with
  the image ready.
- On a real iPhone: Add to Home Screen, open full-screen, Send a meme into iMessage.
