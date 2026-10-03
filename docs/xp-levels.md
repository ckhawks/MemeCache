# XP, levels, ranks, karma and this or that

Written 2026-10-03. This replaces the "contribution points: not planned" line in
`product-ideas.md` section 6 and the TODO.md Medium backlog item "add contribution score to
profile". Build it after `architecture-plan.md` steps 2-3, because it is mostly queries and
should be written against the renamed schema once.

The goal is to reward the work that makes the cache findable: uploading, tagging,
transcribing, and voting on tags. With about 15 users the leaderboard is a friend-group
joke more than a real competition, so the design is cheap and does not need to resist
determined cheating.

---

## Core decision: derive XP, don't store it

Every action worth XP already leaves a row with an author and a timestamp:

| Action | Row | Author column |
|---|---|---|
| Upload | `meme` | `uploader_id` |
| Add tag | `meme_tag` | `added_by` |
| Vote on tag | `meme_tag_vote` | `voter_id` |
| Transcribe | `meme_transcription` | `edited_by` |
| Like received | `meme_like` joined to `meme` | `meme.uploader_id` (karma) |

Since migration 002 there is one `meme_tag` row per (meme, tag), so "tags you added" is a
plain count, and deleted memes are rows with `deleted_at` set, which the view filters.

So XP is a SQL view (`user_xp`) that sums weighted counts per user. No ledger table, no
code in the write paths.

- **Retroactive.** Existing users get credit for the 193 memes and their tags on day one.
- **Can't drift.** Deleting a meme or un-voting removes the XP with it. There is no second
  copy to keep in sync.
- **Tunable.** Changing a weight is a view change, not a data migration.

Cost: at this size the aggregate is a few milliseconds. If that ever stops being true,
turn it into a materialized view refreshed by the same cron that will run enrichment.

The one thing this can't do is a history ("+5 XP for transcribing X" feed). That needs a
ledger table. Not worth it now; add it only if people want the feed.

## Weights

Starting from the backlog's numbers (transcription 5, tag 2, vote 1) and adding upload
and quality signals.

| Source | XP | Rule |
|---|---|---|
| Upload a meme | 10 | Not deleted |
| Add a tag | 2 | Per `(meme, tag)` you added |
| Your tag is well liked | +3 | Tag you added reaches net score >= 3 on that meme |
| Vote on a tag | 1 | Excludes the automatic upvote on your own tag (the add-tag route inserts one) |
| Transcribe a meme | 5 | Once per meme per user, no matter how many edits |

Rules that keep it honest enough:

- Only memes with `deletedAt IS NULL` count.
- Transcription is credited per distinct meme, so re-saving the same text 50 times earns
  nothing extra.
- Self-votes don't count.
- Likes received are karma, not XP (see Karma below). XP is what you do, karma is what
  other people think of it.
- Downvoted tags still give the 2 for adding. The bonus is the reward for good tags; taking
  XP away for bad ones makes people afraid to tag.

**When AI enrichment lands** (product-ideas section 1), tags and transcriptions get
pre-filled and manual contribution drops. At that point add XP for accepting or rejecting
suggested tags (it's just a vote, so it already counts) and for correcting an AI
transcription (already counts as a transcription by you). Nothing needs redesigning, but
revisit the weights once there is a month of data.

## Levels

Level from total XP with a gentle quadratic curve, so early levels come fast and later
ones slow down:

```
xp_for_level(n) = 25 * n * (n - 1)
level(xp)       = floor((1 + sqrt(1 + 4 * xp / 25)) / 2)
```

| Level | Total XP | Roughly |
|---|---|---|
| 1 | 0 | Signed up |
| 2 | 50 | A few uploads |
| 3 | 150 | |
| 5 | 500 | An active week |
| 10 | 2,250 | |
| 20 | 9,500 | Top contributor |

Lives in one pure helper (`src/util/xp.ts`: `levelForXp`, `xpForLevel`, `progressToNext`)
with unit tests, per architecture-plan step 7. Check the curve against real numbers
before shipping: run the view on production and look at where the current 15 users land.
Aim for the most active user around level 8-12, not 40.

## Ranks: a competitive ladder

Level and rank measure different things. **Level** is lifetime XP and only goes up.
**Rank** is a competitive tier from XP earned in the current **season** (one calendar
month), and it resets every season. That makes it play out like a ranked queue in a
game: you can climb, fall behind, and get passed by whoever had a big week.

Because XP is derived from timestamped rows, season XP is the same view filtered to
`created_at >= season_start`. Nothing extra to store for the current season.

### Tiers

Each tier except the top three has four divisions (IV is lowest, I is highest), so a
rank reads like "Gold II".

| Tier | Season XP | How you get it |
|---|---|---|
| Unranked | - | Fewer than 5 actions this season ("placements") |
| Iron | 0 | |
| Bronze | 25 | |
| Silver | 75 | |
| Gold | 150 | |
| Platinum | 300 | |
| Diamond | 500 | |
| Master | 800 | No divisions |
| Grandmaster | - | #2 and #3 on the season board, and at least Master |
| Challenger | - | #1 on the season board, and at least Master. Only one at a time |

The thresholds are placeholders. Set them from a real month of production data so most
people land in Silver to Platinum and Master takes real effort. The top two tiers depend on
position, not a number, so someone can be knocked out of Challenger by a single upload,
which is the joke.

Divisions split each tier's range into quarters. Iron IV to Iron I covers 0-24, and so on.

### Season flavor

Cheap additions that make it read like a real ranked mode:

- **Placements.** "Unranked (3/5 placements)" until you have 5 actions in the season.
- **Promotion and demotion toasts.** "Promoted to Gold III", "You have been demoted from
  Challenger". Same trick as the level-up notice: store `last_seen_rank` on `app_user`, compare
  on page load.
- **Season end.** On the 1st, a small cron writes each user's final rank to
  `season_result (user_id, season, tier, division, position, xp)`. This is the one thing
  that has to be stored, because once the month ends the derived view can't tell you what
  the board looked like on the last day if memes get deleted later.
- **Peak rank and history** on the profile: "S3 Diamond II, S4 Challenger", read from
  `season_result`.
- **Season reward:** last season's Challenger gets a border on their avatar for the next
  month.
- **Decay:** none needed. Monthly reset already does the job.

Admins get no special rank. They climb like everyone else.

## Karma

A third number, like Reddit karma: the net score other people give your contributions.
Unlike XP it can go down, and it can go negative.

| Source | Karma |
|---|---|
| Someone likes your upload | +1 |
| Someone upvotes a tag you added | +1 |
| Someone downvotes a tag you added | -1 |

Self-likes and the automatic upvote on your own tag don't count. Likes on deleted memes
drop out, and an unlike takes the point back, both for free because it is derived like XP.
Same view, one more column.

Shown as a plain number next to the username everywhere a username appears ("ckhawks ·
1,204 karma"), and split into "upload karma" and "tag karma" on the profile, the way
Reddit splits post and comment karma. The leaderboard gets a karma tab.

Karma does not feed level or rank, so you can't climb the ladder by trading likes with a
friend. It's bragging rights only.

## This or that

A mode that shows two memes side by side and asks which is better. Pick one, the next pair
loads. Left and right arrow keys on desktop, tap on mobile, a skip button for pairs that
can't be compared.

**Rating.** Each meme gets an Elo rating, starting at 1000. A pick moves the winner up and
the loser down by an amount that depends on how surprising the result was, so beating a
top meme is worth more than beating a new one. This gives a "top rated" sort that beats
like counts, because likes mostly measure who saw a meme early.

**Storage.** This is the one feature here that can't be purely derived, because Elo
depends on the order of the votes:

- `matchup (id, voter_id, winner_id, loser_id, created_at)`, the history.
- `meme.rating` and `meme.matchup_count`, updated in the same transaction as the insert.
- A script that replays `matchup` in order to rebuild every rating, for when the K-factor
  changes or a meme is deleted.

**Pairing.** Pick the first meme weighted toward low `matchup_count`, so new uploads get
rated quickly. Pick the second from memes within about 200 points of it, so close matchups
outnumber blowouts. Never show the same pair to the same voter twice. Your own uploads can
appear, but your vote on a pair containing one of them is recorded and not applied to
ratings.

**Hooks into the rest of this doc:**

- XP: 1 per pick, capped at 30 a day so clicking through pairs can't win the season.
- Karma: none. Ratings are visible on the meme instead, and that is the reward.
- Profile: "your highest rated upload" and the uploader's average meme rating.
- Leaderboard: a top-rated memes tab, all-time and this season.
- Explore: a "top rated" sort once pagination lands.

**Later:** prompted rounds, where the pair comes with a situation ("which one for when the
plan falls apart?"). Those votes are exactly the "use when" signal search wants in
`product-ideas.md` section 1, so they could feed search ranking.

## Where it shows

1. **Profile** (`me/[username]/page.tsx`): current rank with tier icon, level with a
   progress bar, XP breakdown by source ("42 uploads, 130 tags, 18 transcriptions"), peak
   rank and past seasons. The breakdown is the most useful part. It tells people what is
   worth doing.
2. **Nav bar**: your tier icon, level and karma next to your avatar.
3. **Uploader line** on meme cards and the detail page: tier icon.
4. **Leaderboard** (`/leaderboard`): the season board with rank, season XP and a countdown
   to the season end, plus all-time tabs for level and karma.
5. **Toasts**: level-up, promotion, demotion, placements finished.

## Steps

1. [ ] `user_xp` view in a migration, using the post-step-2 names. Columns: `user_id`, one
       count per source, `xp`, `upload_karma`, `tag_karma`. A function or parameterized
       query for a date window, used for the season.
2. [ ] `src/util/xp.ts`: `levelForXp`, `xpForLevel`, `progressToNext`, `rankForSeason`
       (season XP and board position in, tier and division out). With tests.
3. [ ] `src/db/queries/xp.ts`: `getUserXp`, `getSeasonBoard`, `getSeasonHistory`.
4. [ ] Profile section and leaderboard page.
5. [ ] Nav badge and tier icon on uploader lines.
6. [ ] `last_seen_level` and `last_seen_rank` columns and the toasts.
7. [ ] `season_result` table and the cron that fills it on the 1st. Then peak rank, past
       seasons and the Challenger border.
8. [ ] This or that: `matchup` table, `meme.rating`, the pairing query, the page, the
       replay script, then the top-rated tab and sort.

Steps 1-4 are one session, 5-7 another, 8 a third. 8 doesn't depend on the others, so it
can go first if it sounds more fun. Step 7 has to ship before the first season ends,
or that season's results are lost.

## Open questions

- Monthly seasons, or shorter? With 15 users a week may be too quiet to rank anyone. A
  month is the safer start.
- Tier icons: draw simple ones, or use plain colored text ("GOLD II" in gold).
- This or that across all memes, or only memes you haven't seen yet? Unseen-first doubles as
  discovery, but with 193 memes it runs out quickly.
- Show other users' exact season XP on the board, or only their rank? Exact numbers make
  the race sharper.
