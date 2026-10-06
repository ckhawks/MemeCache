import { db } from '@/db/db';
import { isUuid } from './ids';
import { CARD_COLUMNS, FEED_PAGE_SIZE, type MemeCard } from './memes';
import { CURRENT_TRANSCRIPTIONS } from './transcriptions';
import { mutedSql } from './tagPreferences';

// Search over the words on each meme (its current transcription) and its tags.
//
// Two matchers, because people half-remember memes:
//   - Full-text search, every word as a prefix, each word matched either stemmed (english:
//     "disappointed" finds "disappointment") or as typed (simple: "disappointm" finds it
//     too, where stemming the half word would not). Every word has to be on the meme, in
//     its text or its tags, in any order. Punctuation is ignored.
//   - Trigram similarity (pg_trgm) for typos: "my dissapointment is imeasurable" shares
//     most of its three-letter pieces with the real line even though two of its words
//     match nothing. The cut-off is pg_trgm's default word_similarity_threshold, 0.6.
//
// Ranked by: the query being exactly one of the meme's tags, then every word matching as a
// whole word, then full-text rank (tags weigh more than text) plus similarity, then likes,
// then newest. Memes carrying a tag the viewer muted are left out.
//
// Each version's text vector is stored and indexed (migration 010). Which version is
// current is worked out per query (CURRENT_TRANSCRIPTIONS), because that depends on
// reviews and trust, which change without the text changing. Tags are few and short, so
// their vectors are made on the fly.

export interface SearchQuery {
  // The free text, with tag: filters taken out.
  text: string;
  // The text split into words: lowercased, apostrophes dropped ("don't" is "dont"),
  // anything that is not a letter or digit a separator.
  words: string[];
  // tag:<name> filters. Every one must be on the meme.
  tags: string[];
}

export interface SearchResult extends MemeCard {
  // The matching part of the text, with matched words between \u0001 and \u0002. Null when
  // the meme has no text or the search was only tag filters.
  snippet: string | null;
}

export interface SearchPage {
  memes: SearchResult[];
  total: number;
  nextPage: number | null;
}

const MAX_QUERY_LENGTH = 200;
const MAX_WORDS = 12;

// `tag:cats` or `tag:"dog pile"`, anywhere in the query.
const TAG_FILTER = /(?:^|\s)tag:(?:"([^"]*)"?|(\S+))/gi;

export function parseSearch(raw: string): SearchQuery {
  const input = raw.slice(0, MAX_QUERY_LENGTH);
  const tags: string[] = [];
  const text = input
    .replace(TAG_FILTER, (_, quoted: string | undefined, bare: string | undefined) => {
      const name = (quoted ?? bare ?? '').trim();
      if (name && !tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
        tags.push(name);
      }
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  const words = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  return { text, words, tags };
}

// Puts a query back together, for links that add or drop a tag filter.
export function formatSearch(query: { text: string; tags: string[] }): string {
  const filters = query.tags.map((t) => (/\s/.test(t) ? `tag:"${t}"` : `tag:${t}`));
  return [...filters, query.text].filter(Boolean).join(' ');
}

// Apostrophes out, so "don't" in the text and "dont" in a query meet. The same expression
// as the indexes in migration 010, so the trigram index applies.
const UNAPOSTROPHE = (column: string) => `regexp_replace(${column}, '[''’]', '', 'g')`;

export async function searchMemes(
  query: SearchQuery,
  // savedBy narrows it to one member's Library, where mutes do not apply (the Library lists
  // everything they saved).
  options: { viewerId?: string; savedBy?: string; page?: number; limit?: number } = {}
): Promise<SearchPage> {
  if (query.words.length === 0 && query.tags.length === 0) {
    return { memes: [], total: 0, nextPage: null };
  }
  const limit = options.limit ?? FEED_PAGE_SIZE;
  const page = Math.max(0, Math.floor(options.page ?? 0));
  // What similarity compares against: the words joined back up, so punctuation and case
  // in the query do not count against it. Empty when the query is only tag filters.
  const plain = query.words.join(' ');

  const rows = await db<SearchResult & { total: number }>(
    `WITH
     -- One prefix term per word, stemmed or as typed: ('disappoint':* | 'disappointment':*).
     -- A stop word has no stemmed form, so only the typed one has to match. all_words needs
     -- every word; any_word finds candidates and is what the index answers.
     terms AS (
       SELECT CASE
                WHEN numnode(e) = 0 THEN s::text
                ELSE '(' || e::text || ' | ' || s::text || ')'
              END AS term,
              numnode(e) = 0 AS stop_word
         FROM unnest($2::text[]) w,
              LATERAL (
                SELECT to_tsquery('english', w || ':*') AS e,
                       to_tsquery('simple', w || ':*') AS s
              ) x
     ),
     q AS (
       SELECT (SELECT string_agg(term, ' & ') FROM terms)::tsquery AS all_words,
              -- Stop words would make nearly every meme a candidate, so they only count
              -- when the query is nothing else ("this is fine" still finds candidates by
              -- "fine"; "is" alone has to).
              (SELECT string_agg(term, ' | ')
                 FROM terms
                WHERE NOT stop_word OR NOT EXISTS (SELECT 1 FROM terms WHERE NOT stop_word)
              )::tsquery AS any_word,
              plainto_tsquery('english', $3) AS whole
     ),
     current_text AS (${CURRENT_TRANSCRIPTIONS}),
     -- Tags with any of the words, or close to the whole query. A few hundred short names,
     -- so this is cheap without an index.
     tag_hits AS (
       SELECT t.id
         FROM tag t, q
        WHERE $3 <> ''
          AND (to_tsvector('english', ${UNAPOSTROPHE('t.name')}) @@ q.any_word
               OR to_tsvector('simple', ${UNAPOSTROPHE('t.name')}) @@ q.any_word
               OR ${UNAPOSTROPHE('t.name')} %> $3)
     ),
     -- Tags that count: a net score of at least 1, as on the tag page.
     standing_tags AS (
       SELECT mt.meme_id,
              array_agg(lower(t.name)) AS names,
              string_agg(${UNAPOSTROPHE('t.name')}, ' ') AS joined,
              bool_or(t.id IN (SELECT id FROM tag_hits)) AS hit
         FROM meme_tag mt
         JOIN tag t ON t.id = mt.tag_id
         JOIN (
           SELECT meme_id, tag_id
             FROM counted_tag_vote
            GROUP BY meme_id, tag_id
           HAVING sum(vote) >= 1
         ) s ON s.meme_id = mt.meme_id AND s.tag_id = mt.tag_id
        WHERE mt.removed_at IS NULL
        GROUP BY mt.meme_id
     ),
     -- Versions with any of the words, or close to the whole query: what the two indexes
     -- on meme_transcription answer without reading every text.
     text_hits AS (
       SELECT t.id
         FROM meme_transcription t
        WHERE $3 <> ''
          -- A subquery rather than a join to q, so the planner sees a value it can take to
          -- the index.
          AND (t.search_vector @@ (SELECT any_word FROM q) OR ${UNAPOSTROPHE('t.text')} %> $3)
     ),
     -- Memes worth scoring: a hit in the current text or in the tags. With no words, the
     -- tag filters alone pick them.
     candidates AS (
       SELECT m.id,
              m.created_at,
              t.id AS version_id,
              t.text,
              t.search_vector,
              ${UNAPOSTROPHE('t.text')} AS plain_text,
              st.names,
              st.joined,
              st.hit AS tag_hit
         FROM meme m
         LEFT JOIN current_text ct ON ct.meme_id = m.id
         LEFT JOIN meme_transcription t ON t.id = ct.id
         LEFT JOIN standing_tags st ON st.meme_id = m.id
        WHERE m.deleted_at IS NULL
          AND ($7::uuid IS NOT NULL OR NOT ${mutedSql('m.id', '$1')})
          AND ($7::uuid IS NULL OR EXISTS (
                SELECT 1 FROM meme_save s
                 WHERE s.meme_id = m.id AND s.user_id = $7::uuid AND s.removed_at IS NULL
              ))
          AND COALESCE(st.names, '{}') @> $4::text[]
     ),
     doc AS (
       SELECT c.id,
              c.created_at,
              c.text,
              COALESCE(c.names, '{}') AS tags,
              COALESCE(c.search_vector, '')
                || setweight(to_tsvector('english', COALESCE(c.joined, ''))
                             || to_tsvector('simple', COALESCE(c.joined, '')), 'A')
                AS vector,
              CASE WHEN $3 = '' THEN 0
                ELSE word_similarity($3, COALESCE(c.joined, '') || ' ' || COALESCE(c.plain_text, ''))
              END AS similarity
         FROM candidates c
        WHERE $3 = ''
           OR c.version_id IN (SELECT id FROM text_hits)
           OR c.tag_hit
     ),
     matched AS (
       SELECT d.id,
              d.created_at,
              d.text,
              CASE WHEN $3 = '' THEN 0
                -- Tag names read the way the query's words do: "surprised-pikachu" is
                -- "surprised pikachu".
                ELSE (CASE WHEN EXISTS (
                        SELECT 1
                          FROM unnest(d.tags) tag
                         WHERE trim(regexp_replace(${UNAPOSTROPHE('tag')}, '[^[:alnum:]]+', ' ', 'g')) = $3
                      ) THEN 2 ELSE 0 END)
                   + (CASE WHEN numnode(q.whole) > 0 AND d.vector @@ q.whole THEN 1 ELSE 0 END)
                   + ts_rank_cd(d.vector, q.all_words, 32)
                   + d.similarity
              END AS score
         FROM doc d, q
        WHERE $3 = ''
           OR d.vector @@ q.all_words
           OR d.similarity >= 0.6
     ),
     ranked AS (
       SELECT mt.id,
              mt.text,
              mt.score,
              COALESCE(l.likes, 0) AS likes,
              mt.created_at,
              count(*) OVER () AS total
         FROM matched mt
         LEFT JOIN (
           SELECT l.meme_id, count(*) AS likes
             FROM meme_like l
             JOIN meme lm ON lm.id = l.meme_id
            WHERE l.removed_at IS NULL AND l.user_id <> lm.uploader_id
            GROUP BY l.meme_id
         ) l ON l.meme_id = mt.id
        ORDER BY mt.score DESC, likes DESC, mt.created_at DESC, mt.id DESC
        LIMIT $5 OFFSET $6
     )
     SELECT ${CARD_COLUMNS},
            r.total::int AS total,
            -- Up to 30 words around the match. Most memes have fewer, so it is the whole text.
            CASE WHEN $3 = '' OR COALESCE(r.text, '') = '' THEN NULL
              ELSE ts_headline('english', r.text, (SELECT all_words FROM q),
                'StartSel=' || chr(1) || ', StopSel=' || chr(2)
                  || ', MaxWords=30, MinWords=15, ShortWord=2')
            END AS snippet
       FROM ranked r
       JOIN meme m ON m.id = r.id
       JOIN app_user u ON u.id = m.uploader_id
      ORDER BY r.score DESC, r.likes DESC, r.created_at DESC, r.id DESC`,
    [
      isUuid(options.viewerId) ? options.viewerId : null,
      query.words,
      plain,
      query.tags.map((t) => t.toLowerCase()),
      limit + 1,
      page * limit,
      isUuid(options.savedBy) ? options.savedBy : null,
    ]
  );

  const hasMore = rows.length > limit;
  return {
    memes: rows.slice(0, limit).map(({ total, ...meme }) => meme),
    total: rows[0]?.total ?? 0,
    nextPage: hasMore ? page + 1 : null,
  };
}
