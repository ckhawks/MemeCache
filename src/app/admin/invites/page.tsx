import styles from '../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireAdmin } from '@/server/requireAdmin';
import { listInviteCodes } from '@/db/queries/invites';
import InviteCodes from './InviteCodes';

export const metadata = {
  title: 'Invite codes',
};

export default async function InvitesPage() {
  await requireAdmin();
  const invites = await listInviteCodes();

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to="/admin" text="Admin" />
            <h1>Invite codes</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Registration needs one of these. Send someone the sign-up link and the code is
              filled in for them. A code for everyone is just one with a high limit or none.
              {invites.length === 0 &&
                ' Until the first code exists, the old shared code from ACCESS_CODE still works; making one turns it off.'}
            </p>
          </div>
          <InviteCodes invites={invites} />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
