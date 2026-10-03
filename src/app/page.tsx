import Link from 'next/link';
import { Compass, Grid, PlusSquare, User } from 'react-feather';
import styles from './main.module.scss';
import h from './Home.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import OnlineUsers from '@/components/OnlineUsers';
import MemeWall from '@/components/MemeWall';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getUserFromAccessToken } from '@/auth/lib';
import { countMemes, listMemes } from '@/db/queries/memes';

const RECENT_COUNT = 6;

export default async function Home() {
  const user = await getUserFromAccessToken();
  const [recent, total] = await Promise.all([
    listMemes({ viewerId: user?.id }, null, RECENT_COUNT),
    countMemes({}),
  ]);

  const recentSection = (
    <section className={h.section}>
      <div className={h.sectionHeader}>
        <h2 className={h.sectionTitle}>Latest memes</h2>
        <Link href="/explore" className={h.seeAll}>
          See all {total.toLocaleString()} in Explore
        </Link>
      </div>
      <GalleryMasonry memes={recent.memes} currentUserId={user?.id ?? ''} view="grid" />
    </section>
  );

  if (!user) {
    return (
      <>
        <NavigationBar />
        <main className={styles.main}>
          <div className={styles.content}>
            <section className={h.hero}>
              <MemeWall />
              <div className={h.heroText}>
                <h1 className={h.heroTitle}>MemeCache</h1>
                <p className={h.heroTagline}>
                  Your group&apos;s meme memory. Save the memes you love, find the right one
                  later, and send it in a tap.
                </p>
                <div className={h.heroActions}>
                  <Link href="/login" className={h.heroPrimary}>
                    Log in
                  </Link>
                  <Link href="/register" className={h.heroSecondary}>
                    Join with an invite code
                  </Link>
                </div>
              </div>
            </section>
            {recentSection}
          </div>
        </main>
        <FooterBar />
      </>
    );
  }

  const actions = [
    { href: '/upload', label: 'Upload', note: 'Drop, paste or browse', icon: <PlusSquare size={20} />, primary: true },
    { href: '/explore', label: 'Explore', note: `${total.toLocaleString()} memes`, icon: <Compass size={20} /> },
    { href: '/library', label: 'Library', note: 'Memes you saved', icon: <Grid size={20} /> },
    { href: '/me/' + encodeURIComponent(user.username), label: 'Profile', note: 'Your uploads and stats', icon: <User size={20} /> },
  ];

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <section className={h.greeting}>
            <h1 className={h.greetingTitle}>Hey, {user.username}</h1>
            <OnlineUsers />
          </section>

          <nav className={h.actions} aria-label="Quick actions">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${h.action} ${action.primary ? h.actionPrimary : ''}`}
              >
                <span className={h.actionIcon}>{action.icon}</span>
                <span className={h.actionLabel}>{action.label}</span>
                <span className={h.actionNote}>{action.note}</span>
              </Link>
            ))}
          </nav>

          {recentSection}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
