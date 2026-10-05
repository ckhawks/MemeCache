import Link from 'next/link';
import { randomBytes } from 'node:crypto';
import { ChevronRight, Shuffle } from 'react-feather';
import styles from '../main.module.scss';
import b from './Browse.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import { listTagRows } from '@/db/queries/tags';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import WarningCover from '@/components/WarningCover';

// Browse by tag: a shuffled set of tags, each with a strip of its most-liked memes. The
// shuffle's seed rides in the URL, so "More tags" continues the same order without repeats.
// Following and muting tags will hang off these rows later.
export default async function BrowseTags(props: {
  searchParams: Promise<{ seed?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const seed = searchParams.seed?.slice(0, 16) || randomBytes(4).toString('hex');
  const freshSeed = randomBytes(4).toString('hex');
  const page = Number(searchParams.page) || 0;
  const { rows, nextPage } = await listTagRows({ seed, page });

  const secondary = `${styles.button} ${styles['button-secondary']} ${styles['button-small']}`;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Browse tags</h1>
            <div className={b.intro}>
              <p>A random handful of tags. Open one to see everything in it.</p>
              <Link href={`/tags?seed=${freshSeed}`} className={secondary}>
                <Shuffle size={14} /> Shuffle
              </Link>
            </div>
          </div>

          {rows.length === 0 && (
            <p className={b.empty}>No tags with enough memes yet. Tag some in the queue.</p>
          )}

          <div className={b.rows}>
            {rows.map((row) => {
              const href = `/t/${encodeURIComponent(row.name)}`;
              return (
                <section key={row.id} className={b.row}>
                  <div className={b.rowHeader}>
                    <Link href={href} className={b.tagName}>
                      {row.name}
                    </Link>
                    <span className={b.uses}>
                      {row.uses.toLocaleString()} {row.uses === 1 ? 'meme' : 'memes'}
                    </span>
                    <Link href={href} className={b.seeAll}>
                      See all <ChevronRight size={14} />
                    </Link>
                  </div>
                  <div className={b.strip}>
                    {row.memes.map((meme) => (
                      <Link key={meme.id} href={`/meme/${meme.slug}`} className={b.thumb}>
                        {/* Warned memes stay blurred here; the click opens the meme page. */}
                        <WarningCover compact warnings={meme.warnings} className={b.thumbCover}>
                          {supportedVideoTypes.includes(meme.contentType) ? (
                            // The first frame, as on feed cards.
                            <video src={`/api/resource/${meme.id}#t=0.1`} preload="metadata" muted />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/resource/${meme.id}`} alt="" loading="lazy" />
                          )}
                        </WarningCover>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {nextPage !== null && (
            <div className={b.more}>
              <Link href={`/tags?seed=${seed}&page=${nextPage}`} className={secondary}>
                More tags
              </Link>
            </div>
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
