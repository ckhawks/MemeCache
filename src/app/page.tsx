import Link from 'next/link';
import { Compass, Grid, Hash, PlusSquare, User } from 'react-feather';
import styles from './main.module.scss';
import h from './Home.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import OnlineUsers from '@/components/OnlineUsers';
import MemeWall from '@/components/MemeWall';
import Faq from '@/components/Faq';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getUserFromAccessToken } from '@/auth/lib';
import { countMemes, listTopMemes, TopWindow } from '@/db/queries/memes';

const TOP_COUNT = 6;

const TOP_TITLES: Record<TopWindow, string> = {
  day: 'Top memes today',
  week: 'Top memes this week',
  month: 'Top memes this month',
  all: 'Top memes',
};

export default async function Home() {
  const user = await getUserFromAccessToken();
  const [top, total] = await Promise.all([
    listTopMemes(user?.id, TOP_COUNT),
    countMemes({}),
  ]);

  const topSection = (
    <section className={h.section}>
      <div className={h.sectionHeader}>
        <h2 className={h.sectionTitle}>{TOP_TITLES[top.window]}</h2>
        <Link href="/explore?sort=top" className={h.seeAll}>
          See all {total.toLocaleString()} in Explore
        </Link>
      </div>
      <GalleryMasonry memes={top.memes} currentUserId={user?.id ?? ''} view="grid" />
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
                <p className={h.heroLead}>Keep the good memes. Find them again.</p>
                <p className={h.heroTagline}>
                  Save memes from anywhere into your own collection, searchable by the words on
                  every one. No ads, no engagement bait, and a feed that shows its work.
                </p>
                <div className={h.heroActions}>
                  <Link href="/login" className={h.heroPrimary}>
                    Log in
                  </Link>
                  <Link href="/register" className={h.heroSecondary}>
                    Sign up
                  </Link>
                </div>
              </div>
            </section>
            {topSection}
            <Faq />
          </div>
        </main>
        <FooterBar />
      </>
    );
  }

  const actions = [
    { href: '/upload', label: 'Upload', note: 'Drop, paste or browse', icon: <PlusSquare size={20} />, primary: true },
    { href: '/explore', label: 'Explore', note: `${total.toLocaleString()} memes`, icon: <Compass size={20} /> },
    { href: '/tags', label: 'Browse tags', note: 'A row of memes per tag', icon: <Hash size={20} /> },
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

          {topSection}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
