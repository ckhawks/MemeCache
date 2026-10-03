# Product ideas

Written 2026-10-02. These build on `architecture-plan.md`: search needs steps 1-3 done,
everything else waits for steps 1-4. TODO.md Phase 9 and its backlog have the original list. This file adds new
ideas and sets an order.

The core use of MemeCache is getting the right meme into a conversation quickly. Ideas
are ranked by how much they help with that.

---

## 1. Search for the meme you half remember

This is the feature that sets MemeCache apart. General web search is bad at finding a
meme you remember vaguely: a misquoted line, or "the one with the dog in the burning
room". MemeCache has the inputs (transcriptions, voted tags) but no search at all; the
README calls it the main gap. TODO.md 9a plans full-text search plus OCR at upload. This
extends that plan.

Two things a search has to handle:

- **Dialog and text, fuzzily.** Typos and paraphrase. People rarely remember a quote
  word for word.
- **What is in the media.** Subjects, setting, action, the template if it is a known
  format.

### Enrichment at upload

One vision-model call per meme (the image, or about 4 frames for GIFs and video) returns
structured output:

- on-image text, split by panel or speaker
- a one-line description of what happens
- subjects: people, animals, objects, setting
- template name when it is a known format ("distracted boyfriend", "Drake")
- emotion or stance: smug, shocked, judging, defeated, unbothered
- three to five "use when" lines, such as "when the plan falls apart"
- suggested tags, which users accept or reject through the existing voting

Video gets a second source: **spoken dialog** transcribed with Whisper. For video memes
the remembered line is usually spoken, not written, so this is likely the single biggest
gain.

Known limit: vision models generally will not identify real people from their faces.
A search for a celebrity's name only works if a human tagged it or the name appears in
the text.

**Storage.** A `meme_enrichment` table, one row per meme per source per model version,
holding the text, speech transcript, description, subjects, template and embedding.
Versioned so the whole library can be re-run cheaply when a better model comes out.
Human transcriptions and tag votes always override machine output.

### Search

Hybrid, all inside Postgres:

1. **Keyword:** full-text search with a `tsvector` and GIN index over transcription,
   speech, description, subjects, tags and uploader.
2. **Fuzzy:** `pg_trgm` for typos in quotes and tag names.
3. **Meaning:** text embeddings with `pgvector` over the transcript, description and
   "use when" lines. Catches paraphrase: "I'm not angry, just let down" finds "I'm not
   mad, I'm just disappointed". Also covers "describe what is in it", because the
   description is text.
4. Merge the three result lists with reciprocal rank fusion.
5. **Optional rerank:** send the top 20 (descriptions or small thumbnails) to a model to
   reorder. Add only if the plain ranking feels wrong.

No separate image-embedding model (CLIP-style). The text description covers "describe
what is in it", and an image model would be the heaviest thing to host. Revisit if text
descriptions miss things in practice.

**Situation search** ("friend locked keys in car again") uses the same embeddings against
the "use when" lines. Show those results grouped by stance (sympathetic, mocking, shocked)
rather than one ranked list. The right reaction depends on how the sender wants to
respond, not only on what was said. This started as an idea for a standalone cat reaction
GIF picker; building it here means the library is already curated and there are no Giphy
or Tenor API terms to work around.

### Measuring it

Before building, write 20-30 test queries the way you would actually search for memes
you remember vaguely, each with the right answer. Score every change against that ("right
meme in top 3 for 19 of 25") instead of by feel.

### Staging

Assuming architecture steps 1-3 are done:

| Stage | What it adds | Effort |
|---|---|---|
| A | Keyword and fuzzy search over existing transcriptions and tags | ~1 session |
| B | Enrichment and backfill, including the 119 memes with no transcription | 1-2 sessions |
| C | Embeddings, hybrid ranking, optional rerank | 1-2 sessions |

Search only depends on architecture steps 1-3, so it could come before steps 4-6.

### Cost

Most of this runs for free. The only paid part is the vision-model call at upload.

| Piece | Runs where | One-time | Monthly |
|---|---|---|---|
| Keyword and fuzzy search | Postgres extensions | $0 | $0 |
| Enrichment (Claude Haiku 4.5) | API, Batch API for backfill | ~$0.50 for 193 memes | ~$0.15-0.30 per 100 uploads |
| Video dialog (Whisper) | local: faster-whisper or whisper.cpp | $0 | $0 |
| Text embeddings (bge-small or MiniLM, ~100 MB) | in the Node app on Dallas | $0 | $0 |
| Rerank (optional) | API | - | ~$1-2 at a few hundred searches |
| Storage | R2 free tier, 10 GB, zero egress | $0 | $0 |

Under $1 to set up and under $5 a month even with reranking on.

How the per-meme figure is estimated:

- Haiku 4.5 is $1 per million input tokens, $5 per million output (price list as of
  2026-09-25). Sonnet 5.5 is $2 / $10.
- An image downscaled to ~800px is ~850 tokens (roughly width x height / 750), plus ~200
  for the instructions and ~400 for the structured answer: about $0.003 per image, about
  $0.006 for 4 frames.
- The Batch API halves that for the backfill, which does not need to be fast.
- Pick Haiku or Sonnet by which one reads stylized meme text better on ~20 test memes.
  At this volume the price difference is pennies.
- These are estimates. Check the real cost per meme on the first backfill batch before
  running the rest.

Guardrails:

- Set a monthly spend limit in the Anthropic Console (for example $10) so a bug cannot
  run up a bill.
- Enrichment runs once per meme per model version; never on page views or searches.
- The embedding model runs in-process. It fits inside the app's 768 MB `MemoryMax`, but
  check resident memory after adding it.

## 2. Sending a meme in one action

- Copy-image button on every card (`navigator.clipboard.write()`), plus copy-link (TODO.md
  9b).
- A "my most-sent" row at the top of the library. Needs a small `meme_send` table written
  by the copy and download buttons. No Redis; the backlog's view-count note assumed it was
  needed, and it isn't.
- PWA with a Web Share Target so you can share an image from a phone straight into
  MemeCache (TODO.md 9b).

## 3. Better upload

Done 2026-10-03: a drop zone that takes drag-and-drop, paste (Ctrl+V) or a click, a crop
tool whose edges snap to lines in the image, and a done state linking to the new meme.

- Drag-and-drop for multiple files, with a queue (TODO.md 9c).
- Duplicate warning from the perceptual hash stored by the media pipeline (TODO.md 9e).
- Enrichment from section 1 runs after upload, and the uploader sees the suggested tags
  and transcription to confirm.

### Import from a link, and from other sites

Most memes are seen somewhere else first. Saving one should not mean download, find the
file, upload.

- **Paste a link.** The upload page takes a URL as well as a file. The server fetches the
  page, finds the media (Open Graph `og:image`/`og:video`, or the URL itself when it is
  already an image or video), downloads it and opens it in the normal preview and crop
  step. Covers most image hosts, Reddit, Discord CDN links and plain image URLs.
- **Video sites** (TikTok, Instagram Reels, X/Twitter, YouTube Shorts) do not expose the
  file in their page tags. `yt-dlp` on the Dallas box handles all of them; run it from the
  import endpoint with a size and duration cap. It breaks whenever those sites change, so
  keep it updated and fail with a clear message.
- **Browser extension.** A "Save to MemeCache" item in the right-click menu on any image or
  video, sending the media URL (or the image bytes, for pages that need login) to the same
  import endpoint with the user's session. Chrome and Firefox share most of the code
  (WebExtensions). Small, and the fastest path of all on desktop.
- **Phone:** the Android share target already covers "share to MemeCache" from other apps
  (`docs/ui-and-pwa.md`). Sharing a link (rather than a file) should go through the same
  link import.
- Safety: the fetch runs server-side, so guard against SSRF (no private IP ranges, no
  redirects into them), cap download size, and check the content type before storing.

## 4. Discord slash command

`/meme <query>` in a Discord server, backed by the same search, with a picker of a few
results. Optionally reads the last few channel messages for situation search. This is a
small service that calls the MemeCache search endpoint, built after search exists.

TODO.md 9f's new-upload webhook is a smaller, separate idea and can ship any time.

## 5. Browsing

After pagination lands: random, "top this week" and tag browsing (TODO.md 9h). A
"needs work" queue of memes without a transcription or with fewer than 5 tags (from the
TODO.md backlog) becomes less necessary once enrichment fills most of that in.

## 6. Later or unlikely

- **AI-generated content flag** (TODO.md 9d). Fine to build, but not urgent.
- **Collections.** Removed in the architecture plan. Bring back as many-to-many if people
  ask.
- **Social features:** follow tag, following feed, comments, notifications. With 15
  users these add upkeep without much use. Not planned. (Contribution points moved to
  `xp-levels.md`.)
- **Standalone cat GIF app or keyboard.** Considered and set aside in favor of section 1.
  A mobile keyboard can only see the text field, not the conversation, which removes most
  of what makes situation search useful.
