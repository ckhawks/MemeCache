import { mayRelate, relate, type Fingerprint, type RelationKind } from '@/server/mediaHash';
import { fingerprintMedia } from '@/server/mediaHashDecode';
import { STILL_IMAGE_TYPES } from '@/constants/mimeTypes';
import {
  getFingerprints,
  getMemeLinks,
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
  // The very same picture (isExactCopy in src/server/mediaHash.ts).
  exact?: boolean;
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

// The live meme an upload is an exact copy of: an exact match that is a still picture
// itself. Null when there is none.
export async function findExactCopy(matches: FoundMatch[]): Promise<{ id: string; slug: string } | null> {
  const exact = matches.filter((m) => m.exact);
  if (exact.length === 0) {
    return null;
  }
  const memes = await getMemeLinks(exact.map((m) => m.memeId));
  const copyOf = memes.find((m) => STILL_IMAGE_TYPES.includes(m.contentType));
  return copyOf ? { id: copyOf.id, slug: copyOf.slug } : null;
}

// A file's fingerprint and what it matches, or why it has none.
export type Fingerprinted = { fingerprint: Fingerprint; matches: FoundMatch[] } | { error: string };

// Fingerprints a file and finds the memes it matches, before or after it is stored (a
// stored meme is left out of its own matches by excludeId). Never throws. The upload runs
// this before storing a still image, to refuse an exact copy; fingerprintAndMatch after.
export async function fingerprintAndFind(
  file: Buffer,
  contentType: string,
  excludeId?: string
): Promise<Fingerprinted> {
  let fingerprint: Fingerprint;
  try {
    fingerprint = await fingerprintMedia(file, contentType);
  } catch (error) {
    console.error(`Could not fingerprint ${excludeId ? `meme ${excludeId}` : 'an upload'}:`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { fingerprint, matches: await findMatches(fingerprint, excludeId) };
  } catch (error) {
    // The fingerprint is still worth keeping; the backfill's rebuild finds the matches.
    console.error('Could not look for matches:', error);
    return { fingerprint, matches: [] };
  }
}

// Records a stored meme's fingerprint and matches, or that it could not be fingerprinted,
// so the backfill moves on. Never throws: a meme without a fingerprint is still a meme.
export async function saveFingerprinted(memeId: string, result: Fingerprinted) {
  try {
    if ('error' in result) {
      await saveFingerprintError(memeId, result.error);
      return;
    }
    await saveFingerprint(memeId, result.fingerprint);
    await saveMatches(
      result.matches
        .filter((m) => m.memeId !== memeId)
        .map((m) => ({ memeId, otherId: m.memeId, kind: m.kind, score: m.score }))
    );
  } catch (error) {
    console.error(`Could not store the fingerprint or matches of meme ${memeId}:`, error);
  }
}

// Fingerprints a newly stored meme and records what it matches. Never throws.
export async function fingerprintAndMatch(memeId: string, file: Buffer, contentType: string) {
  await saveFingerprinted(memeId, await fingerprintAndFind(file, contentType, memeId));
}
