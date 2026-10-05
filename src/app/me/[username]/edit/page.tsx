// library/page.tsx

import { getProfile } from '@/db/queries/users';
import { avatarUrl } from '@/util/avatarUrl';
import styles from '../../../main.module.scss';
import { notFound, permanentRedirect } from 'next/navigation';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import { Col, Row } from 'react-bootstrap';
import FooterBar from '@/components/FooterBar';
import EditAvatarComponent from './EditAvatarComponent';
import f from '@/components/AuthForm.module.scss';
import BackButton from '@/components/BackButton';
import WarningDisplaySetting from './WarningDisplaySetting';
import { getWarningDisplay } from '@/db/queries/warnings';
import EditUsernameForm from './EditUsernameForm';
import YourTags from '@/components/YourTags';
import { listTagPreferences } from '@/db/queries/tagPreferences';
import {
  findRenamedUsername,
  getUsernameCooldown,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_RESERVED_DAYS,
} from '@/db/queries/usernames';

export default async function Profile(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  if (!params.username) {
    notFound();
  }

  const userFromDb = await getProfile(params.username);

  if (!userFromDb) {
    // An old name, from before a rename.
    const renamed = await findRenamedUsername(params.username);
    if (renamed) {
      permanentRedirect('/me/' + encodeURIComponent(renamed) + '/edit');
    }
    notFound();
  }

  const isCurrentUser = user?.id === userFromDb.id;
  // Someone else's edit page does not exist as far as this visitor is concerned.
  if (!isCurrentUser) {
    notFound();
  }

  const warningDisplay = await getWarningDisplay(userFromDb.id);
  const cooldown = await getUsernameCooldown(userFromDb.id);
  const tagPreferences = await listTagPreferences(userFromDb.id);

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/me/' + encodeURIComponent(userFromDb.username)} text="Back" />
            <h1>Edit profile</h1>
            {/* The username can be changed, on a cooldown (migration 011). The email is
                shown for reference only. */}
            <div className={'card'} style={{ marginBottom: '16px' }}>
              <h5>Account</h5>
              <div className={f.form} style={{ maxWidth: '420px' }}>
                <EditUsernameForm
                  // A fresh form after a rename, so it starts from the new name.
                  key={userFromDb.username}
                  username={userFromDb.username}
                  cooldownDays={USERNAME_COOLDOWN_DAYS}
                  reservedDays={USERNAME_RESERVED_DAYS}
                  lastChangedAt={cooldown.lastChangedAt?.toISOString() ?? null}
                  availableAt={cooldown.availableAt?.toISOString() ?? null}
                  now={cooldown.now.toISOString()}
                />
                <div className={f.field}>
                  <label htmlFor="account-email" className={f.label}>
                    Email
                  </label>
                  <input id="account-email" className={f.input} value={user?.email ?? ''} readOnly />
                  <span className={f.hint}>Only you can see your email. It cannot be changed yet.</span>
                </div>
              </div>
            </div>
            <div className={'card'}>
              {/* Wraps on phones, so the preview drops below instead of squeezing the form. */}
              <Row
                style={{
                  justifyContent: 'space-between',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  rowGap: '16px',
                }}
              >
                <Col style={{ minWidth: '240px' }}>
                  <h5>Avatar</h5>
                  <p style={{ fontSize: '14px' }}>
                    Any image up to 2MB. It is cropped to a square from the
                    center and shown at 128x128.
                  </p>
                  <EditAvatarComponent />
                </Col>
                <div style={{ marginLeft: 'auto', width: 'unset' }}>
                  {/* A plain img: the query string busts the cache after an avatar change,
                      and Next 16's image optimizer rejects query strings it has not been
                      told about. Optimizing a per-user dynamic avatar gains nothing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl(userFromDb.username, userFromDb.avatarS3Key)}
                    width={128}
                    height={128}
                    style={{ borderRadius: '100%' }}
                    alt=""
                  />
                </div>
              </Row>
            </div>
            <div className={'card'} style={{ marginTop: '16px' }}>
              <h5>Content warnings</h5>
              <p style={{ fontSize: '14px' }}>
                How memes with a content warning (NSFW, gore and the like) are shown to you.
              </p>
              <WarningDisplaySetting display={warningDisplay} />
            </div>
            <div className={'card'} style={{ marginTop: '16px' }}>
              <h5>Your tags</h5>
              <p style={{ fontSize: '14px' }}>
                Tags you follow come first in For you on Explore. Tags you mute are hidden from your feeds. Only you can see these.
              </p>
              <YourTags tags={tagPreferences} />
            </div>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
