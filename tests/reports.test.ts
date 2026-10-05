import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { softDeleteMeme } from '@/db/queries/memes';
import {
  countOpenReports,
  getOwnOpenReport,
  listReportGroups,
  reportMeme,
  resolveReports,
} from '@/db/queries/reports';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

describe('reports', () => {
  it('keeps one open report per member per meme, and reporting again replaces it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await reportMeme(meme, bob, 'spam', null);
    await reportMeme(meme, bob, 'illegal', 'see the caption');

    expect(await getOwnOpenReport(meme, bob)).toEqual({ reason: 'illegal', details: 'see the caption' });
    expect(await getOwnOpenReport(meme, alice)).toBeNull();
    expect(await countOpenReports()).toEqual({ reports: 1, memes: 1 });
  });

  it('rejects a reason outside the allowed set', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await expect(
      db(`INSERT INTO meme_report (meme_id, reporter_id, reason) VALUES ($1, $2, 'boring')`, [meme, bob])
    ).rejects.toThrow();
  });

  it('groups open reports by meme, newest first, with reasons counted', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const older = await makeMeme(alice);
    const newer = await makeMeme(alice);

    await reportMeme(older, bob, 'spam', null);
    await reportMeme(older, carol, 'spam', null);
    await reportMeme(older, dave, 'other', 'reposted from yesterday');
    await reportMeme(newer, bob, 'private_person', null);
    await db(`UPDATE meme_report SET created_at = now() - interval '1 hour' WHERE meme_id = $1`, [older]);

    const groups = await listReportGroups('open');
    expect(groups.map((g) => g.meme.id)).toEqual([newer, older]);
    expect(groups[1].reasons).toEqual([
      { reason: 'spam', count: 2 },
      { reason: 'other', count: 1 },
    ]);
    expect(groups[1].reports).toHaveLength(3);
    expect(groups[1].reports.find((r) => r.reporterUsername === 'dave')?.details).toBe('reposted from yesterday');
    expect(groups[1].meme.uploaderUsername).toBe('alice');
    expect(await countOpenReports()).toEqual({ reports: 4, memes: 2 });
  });

  it('dismissing keeps the rows, moves them to resolved, and lets the member report again', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);
    await reportMeme(meme, bob, 'not_funny', null);

    expect(await resolveReports(meme, mod, 'dismissed', 'it is funny')).toBe(1);
    expect(await resolveReports(meme, mod, 'dismissed', null)).toBe(0);
    expect(await listReportGroups('open')).toEqual([]);

    const [resolved] = await listReportGroups('resolved');
    expect(resolved.reports[0]).toMatchObject({
      status: 'dismissed',
      resolvedByUsername: 'mod',
      resolutionNote: 'it is funny',
    });
    expect(resolved.reports[0].resolvedAt).toBeInstanceOf(Date);

    await reportMeme(meme, bob, 'not_funny', 'still not');
    const [{ count }] = await db<{ count: number }>(`SELECT count(*)::int AS count FROM meme_report`);
    expect(count).toBe(2);
    expect(await countOpenReports()).toEqual({ reports: 1, memes: 1 });
  });

  it('records a takedown as actioned and still lists the deleted meme', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);
    await reportMeme(meme, bob, 'illegal', null);
    await reportMeme(meme, carol, 'illegal', null);

    expect(await resolveReports(meme, mod, 'actioned', null)).toBe(2);
    await softDeleteMeme(meme);

    const [group] = await listReportGroups('resolved');
    expect(group.meme.deleted).toBe(true);
    expect(group.reports.every((r) => r.status === 'actioned')).toBe(true);
    expect(await countOpenReports()).toEqual({ reports: 0, memes: 0 });
  });

  it('ignores a malformed meme id when resolving', async () => {
    const mod = await makeUser('mod');
    expect(await resolveReports('not-a-uuid', mod, 'dismissed', null)).toBe(0);
  });
});
