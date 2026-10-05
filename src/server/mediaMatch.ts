import { mayRelate, relate, type Fingerprint, type RelationKind } from '@/server/mediaHash';
import { fingerprintMedia } from '@/server/mediaHashDecode';
import {
  getFingerprints,
  listMemeHashes,
  saveFingerprint,
  saveFingerprintError,
  saveMatches,
  type MediaMatch,
} from '@/db/queries/mediaHash';

// Finding the memes a fingerprint relates to. A linear scan: the hashes of every meme are
// loaded and compared (microseconds each), and only the few that pass are loaded in full
// and compared properly (a couple of milliseconds each). Comfortable to tens of thousands
// of memes; past that the hash pass wants an index (multi-index hashing on the 64-bit
// hashes) or to move into SQL.

export interface FoundMatch {
  memeId: string;
  kind: RelationKind;
  score: number;
}

// Duplicates first, then the closest.
function byStrength(a: FoundMatch, b: FoundMatch) {
  return Number(b.kind === 'duplicate') - Number(a.kind === 'duplicate') || b.score - a.score;
}

export async function findMatches(fingerprint: Fingerprint, excludeId?: string): Promise<FoundMatch[]> {
  const candidates = (await listMemeHashes())
    .filter((m) => m.memeId !== excludeId && mayRelate(fingerprint.regions, m.regions))
    .map((m) => m.memeId);
  if (candidates.length === 0) {
    return [];
  }
  const fingerprints = await getFingerprints(candidates);
  const found: FoundMatch[] = [];
  for (const [memeId, other] of fingerprints) {
    const relation = relate(fingerprint, other);
    if (relation) {
      found.push({ memeId, ...relation });
    }
  }
  return found.sort(byStrength);
}

// Every related pair among the given memes, each once. For the backfill, which holds them
// all in memory anyway.
export function matchAll(fingerprints: Map<string, Fingerprint>): MediaMatch[] {
  const entries = [...fingerprints.entries()];
  const matches: MediaMatch[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [memeId, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [otherId, b] = entries[j];
      if (!mayRelate(a.regions, b.regions)) {
        continue;
      }
      const relation = relate(a, b);
      if (relation) {
        matches.push({ memeId, otherId, ...relation });
      }
    }
  }
  return matches;
}

// Fingerprints a newly stored meme and records what it matches. Never throws: a meme that
// cannot be fingerprinted is still a meme, and the failure is recorded for the backfill.
export async function fingerprintAndMatch(memeId: string, file: Buffer, contentType: string) {
  let fingerprint: Fingerprint;
  try {
    fingerprint = await fingerprintMedia(file, contentType);
  } catch (error) {
    console.error(`Could not fingerprint meme ${memeId}:`, error);
    await saveFingerprintError(memeId, error instanceof Error ? error.message : String(error)).catch(
      (err) => console.error('Could not record the fingerprint failure:', err)
    );
    return;
  }
  try {
    await saveFingerprint(memeId, fingerprint);
    const found = await findMatches(fingerprint, memeId);
    await saveMatches(found.map((m) => ({ memeId, otherId: m.memeId, kind: m.kind, score: m.score })));
  } catch (error) {
    console.error(`Could not store the fingerprint or matches of meme ${memeId}:`, error);
  }
}
