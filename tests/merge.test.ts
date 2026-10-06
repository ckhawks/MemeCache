import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { getMeme } from '@/db/queries/memes';
import { getMergedInto, MergeError, mergeMemes } from '@/db/queries/merge';
import { setLike } from '@/db/queries/likes';
import { setSave } from '@/db/queries/saves';
import { addComment, listComments } from '@/db/queries/comments';
import { addTagToMeme, findOrCreateTag, listTagsForMeme, voteOnTag } from '@/db/queries/tags';
import { addTranscription, getCurrentTranscription, reviewTranscription } from '@/db/queries/transcriptions';
import { addWarnings, listWarningsForMeme } from '@/db/queries/warnings';
import { reportMeme } from '@/db/queries/reports';
import { recordView } from '@/db/queries/views';
import { notify } from '@/db/queries/notifications';
import { recordEvent } from '@/db/queries/events';
import { softDeleteMeme } from '@/db/queries/memes';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

let mod: string;
let alice: string;
let bob: string;
let carol: string;
let dave: string;
let original: string;
let duplicate: string;

beforeEach(async () => {
  mod = await makeUser('mod');
  alice = await makeUser('alice');
  bob = await makeUser('bob');
  carol = await makeUser('carol');
  dave = await makeUser('dave');
  original = await makeMeme(alice, '2026-01-01T00:00:00Z');
  duplicate = await makeMeme(bob, '2026-02-01T00:00:00Z');
});

async function count(sql: string, params: unknown[]) {
  const [row] = await db<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, params);
  return row.n;
}

describe('mergeMemes', () => {
  it('moves likes and saves, keeping one live row per person', async () => {
    // Carol liked both: one like stays. Dave liked only the duplicate: it moves. Alice (the
    // original's uploader) liked the copy: it stays behind, nobody likes their own meme.
    await setLike(original, carol, true);
    await setLike(duplicate, carol, true);
    await setLike(duplicate, dave, true);
    await setLike(duplicate, alice, true);
    await setSave(original, carol, true);
    await setSave(duplicate, carol, true);
    await setSave(duplicate, dave, true);

    const result = await mergeMemes(duplicate, original, mod);
    expect(result.moved.likes).toBe(1);
    expect(result.moved.saves).toBe(1);

    expect((await getMeme(original, carol))!.likeCount).toBe(2);
    expect(await count(`SELECT 1 FROM meme_like WHERE meme_id = $1 AND removed_at IS NULL`, [original])).toBe(2);
    expect(await count(`SELECT 1 FROM meme_save WHERE meme_id = $1 AND removed_at IS NULL`, [original])).toBe(2);
    // What stayed behind is still there, on the deleted duplicate.
    expect(await count(`SELECT 1 FROM meme_like WHERE meme_id = $1`, [duplicate])).toBe(2);
  });

  it('moves a tag only the copy has whole, and merges votes on a tag both have', async () => {
    const cats = await findOrCreateTag('cats', carol);
    const dogs = await findOrCreateTag('dogs', carol);
    // dogs: on both. Alice added it to the original, Carol to the copy; Dave voted on the
    // copy's and Carol's own upvote comes with her.
    await addTagToMeme(original, dogs, alice);
    await addTagToMeme(duplicate, dogs, carol);
    await voteOnTag(duplicate, dogs, dave, 1);
    // cats: only on the copy, added by Carol, downvoted by Dave.
    await addTagToMeme(duplicate, cats, carol);
    await voteOnTag(duplicate, cats, dave, -1);

    const result = await mergeMemes(duplicate, original, mod);
    expect(result.moved.tags).toBe(1);

    const tags = await listTagsForMeme(original, mod);
    const byName = Object.fromEntries(tags.map((t) => [t.name, t]));
    // Alice's +1, Carol's +1 and Dave's +1.
    expect(byName.dogs.score).toBe(3);
    // Carol's +1 and Dave's -1, still Carol's tag.
    expect(byName.cats.score).toBe(0);
    const [catsRow] = await db<{ addedBy: string }>(
      `SELECT added_by AS "addedBy" FROM meme_tag WHERE meme_id = $1 AND tag_id = $2`,
      [original, cats]
    );
    expect(catsRow.addedBy).toBe(carol);
    // The copy's dogs application stays behind (the original's is kept); its cats row moved.
    expect(await count(`SELECT 1 FROM meme_tag WHERE meme_id = $1`, [duplicate])).toBe(1);
    // History followed the votes that moved.
    expect(await count(`SELECT 1 FROM tag_vote_history WHERE meme_id = $1`, [original])).toBe(5);
    expect(await count(`SELECT 1 FROM tag_vote_history WHERE meme_id = $1`, [duplicate])).toBe(0);
  });

  it("keeps the original's transcription, and takes the copy's when the original has none", async () => {
    await addTranscription(original, 'the original text', alice);
    await addTranscription(duplicate, 'the copy text', bob);
    await mergeMemes(duplicate, original, mod);
    expect((await getCurrentTranscription(original))!.text).toBe('the original text');
    expect(await count(`SELECT 1 FROM meme_transcription WHERE meme_id = $1`, [duplicate])).toBe(1);

    const bare = await makeMeme(alice, '2026-03-01T00:00:00Z');
    const copy = await makeMeme(bob);
    const version = await addTranscription(copy, 'copied text', bob);
    await reviewTranscription(version.id, carol, 1);
    await mergeMemes(copy, bare, mod);
    const current = await getCurrentTranscription(bare);
    expect(current).toMatchObject({ text: 'copied text', confirms: 1 });
  });

  it('moves comments, replies made with the copy, views, warnings, reports, events and notifications', async () => {
    const other = await makeMeme(carol);
    await addComment({ memeId: duplicate, authorId: carol, body: 'nice', refMemeId: null });
    await addComment({ memeId: other, authorId: dave, body: '', refMemeId: duplicate });
    await recordView(duplicate, { userId: carol });
    await recordView(duplicate, { userId: dave });
    await recordView(original, { userId: dave });
    await addWarnings(duplicate, ['nsfw', 'ai'], bob);
    await addWarnings(original, ['nsfw'], alice);
    await reportMeme(duplicate, carol, 'spam', null);
    await reportMeme(original, dave, 'spam', null);
    await reportMeme(duplicate, dave, 'not_funny', null);
    await recordEvent({ kind: 'upload', userId: bob, memeId: duplicate });
    await notify({ recipientId: bob, kind: 'like', actorId: carol, memeId: duplicate });
    await notify({ recipientId: alice, kind: 'like', actorId: carol, memeId: original });
    await notify({ recipientId: bob, kind: 'like', actorId: dave, memeId: duplicate });
    // The same person told twice that the same person liked it: one stays behind.
    await notify({ recipientId: alice, kind: 'like', actorId: dave, memeId: duplicate });
    await notify({ recipientId: alice, kind: 'like', actorId: dave, memeId: original });

    const result = await mergeMemes(duplicate, original, mod);
    expect(result.moved).toMatchObject({
      comments: 1,
      commentRefs: 1,
      views: 2,
      warnings: 1,
      reports: 1,
      events: 1,
      notifications: 2,
    });

    expect((await listComments(original)).map((c) => c.body)).toEqual(['nice']);
    const [ref] = await db<{ ref: string }>(`SELECT ref_meme_id AS ref FROM meme_comment WHERE meme_id = $1`, [other]);
    expect(ref.ref).toBe(original);
    expect((await getMeme(original))!.viewCount).toBe(3);
    expect((await listWarningsForMeme(original)).map((w) => w.warning).sort()).toEqual(['ai', 'nsfw']);
    // Dave's open report on the copy stays behind: he has one open on the original.
    expect(await count(`SELECT 1 FROM meme_report WHERE meme_id = $1 AND status = 'open'`, [original])).toBe(2);
    const [event] = await db<{ memeId: string; data: { mergedFrom: string } }>(
      `SELECT meme_id AS "memeId", data FROM event WHERE kind = 'upload'`
    );
    expect(event).toEqual({ memeId: original, data: { mergedFrom: duplicate } });
    expect(await count(`SELECT 1 FROM notification WHERE meme_id = $1`, [original])).toBe(4);
    expect(await count(`SELECT 1 FROM notification WHERE meme_id = $1`, [duplicate])).toBe(1);
  });

  it('deletes the copy pointing at the original, redirects its slug, and logs the merge', async () => {
    const [dup] = await db<{ slug: string }>(`SELECT slug FROM meme WHERE id = $1`, [duplicate]);
    const result = await mergeMemes(duplicate, original, mod);

    expect(await getMeme(duplicate)).toBeNull();
    const [row] = await db<{ mergedInto: string; deletedBy: string; reason: string }>(
      `SELECT merged_into AS "mergedInto", deleted_by AS "deletedBy", delete_reason AS reason
         FROM meme WHERE id = $1`,
      [duplicate]
    );
    expect(row).toEqual({ mergedInto: original, deletedBy: mod, reason: `Merged into ${result.originalSlug}` });
    expect(await getMergedInto(dup.slug)).toBe(result.originalSlug);
    expect(await getMergedInto(duplicate)).toBe(result.originalSlug);
    expect(await getMergedInto(result.originalSlug)).toBeNull();

    const [log] = await db<{ action: string; targetId: string; data: { originalId: string } }>(
      `SELECT action, target_id AS "targetId", data FROM moderation_action`
    );
    expect(log).toMatchObject({ action: 'meme_merge', targetId: duplicate, data: { originalId: original } });
  });

  it('repoints earlier merges when the original is merged on, so a redirect is one hop', async () => {
    const third = await makeMeme(carol, '2025-12-01T00:00:00Z');
    await mergeMemes(duplicate, original, mod);
    const result = await mergeMemes(original, third, mod);
    const [row] = await db<{ mergedInto: string }>(`SELECT merged_into AS "mergedInto" FROM meme WHERE id = $1`, [
      duplicate,
    ]);
    expect(row.mergedInto).toBe(third);
    expect(await getMergedInto(duplicate)).toBe(result.originalSlug);
  });

  it('refuses a merge into itself or with a deleted meme, changing nothing', async () => {
    await expect(mergeMemes(duplicate, duplicate, mod)).rejects.toBeInstanceOf(MergeError);
    await softDeleteMeme(original);
    await setLike(duplicate, carol, true);
    await expect(mergeMemes(duplicate, original, mod)).rejects.toBeInstanceOf(MergeError);
    expect(await count(`SELECT 1 FROM meme_like WHERE meme_id = $1`, [duplicate])).toBe(1);
    expect(await getMeme(duplicate)).not.toBeNull();
    expect(await count(`SELECT 1 FROM moderation_action`, [])).toBe(0);
  });
});
