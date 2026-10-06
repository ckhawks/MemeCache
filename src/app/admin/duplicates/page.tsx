import Link from 'next/link';
import styles from '../../main.module.scss';
import r from '../reports/Reports.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireModerator } from '@/server/requireAdmin';
import { isAdmin } from '@/auth/role';
import { countAdminPairs, listAdminPairs } from '@/db/queries/duplicates';
import DuplicatePairCard from './DuplicatePairCard';

export const metadata = {
  title: 'Duplicates',
};

// Pairs of memes the fingerprints matched (migrations 013 and 021). "Same meme" lists the
// pairs settled as the same meme, by the queue or a moderator, waiting to be merged or
// turned down. "Not settled" lists the rest, for a moderator to answer without waiting for
// the queue. Moderators and admins.
export default async function Duplicates(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireModerator();
  const searchParams = await props.searchParams;
  const view = searchParams.view === 'open' ? 'open' : 'settled';
  const [pairs, counts] = await Promise.all([listAdminPairs(view), countAdminPairs()]);

  const tabClass = (active: boolean) =>
    `${styles.button} ${styles['button-small']} ${active ? '' : styles['button-secondary']}`;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {isAdmin(user) && <BackButton to="/admin" text="Admin" />}
            <h1>Duplicates</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Memes that look alike. Merge moves everything on the copy (likes, saves, comments, tags, views) to the original and deletes the copy; its link goes to the original from then on. The older one is picked as the original unless you pick the other. Your answer here settles a pair on its own.
            </p>
          </div>

          <div className={r.reports}>
            <nav className={r.tabs} aria-label="Duplicates">
              <Link
                href="/admin/duplicates"
                className={tabClass(view === 'settled')}
                aria-current={view === 'settled' ? 'page' : undefined}
              >
                Same meme <span className={r.count}>{counts.settled}</span>
              </Link>
              <Link
                href="/admin/duplicates?view=open"
                className={tabClass(view === 'open')}
                aria-current={view === 'open' ? 'page' : undefined}
              >
                Not settled <span className={r.count}>{counts.open}</span>
              </Link>
            </nav>

            {pairs.length === 0 ? (
              <p className={r.muted}>
                {view === 'settled' ? 'Nothing waiting to be merged.' : 'Every pair is settled.'}
              </p>
            ) : (
              pairs.map((pair) => (
                <DuplicatePairCard key={`${pair.memeId} ${pair.otherId}`} pair={pair} settled={view === 'settled'} />
              ))
            )}
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
