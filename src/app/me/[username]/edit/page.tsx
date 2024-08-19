// library/page.tsx

import { db } from '@/db/db';
import styles from '../../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import { Plus } from 'react-feather';
import { Button, Col, Row } from 'react-bootstrap';
// import CacheAccordion from './CacheAccordion';
import FooterBar from '@/components/FooterBar';
import EditAvatarComponent from './EditAvatarComponent';
import EditUsernameComponent from './EditUsernameComponent';
import EditBioComponent from './EditBioComponent';
import BackButton from '@/components/BackButton';

export default async function Profile({
  params,
}: {
  params: { username: string };
}) {
  const user = await getUserFromAccessToken();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  if (params.username === null) {
    return (
      <>
        <NavigationBar username={(user && user.username) || ''} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>Please enter a profile name.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const users = await db(
    `SELECT u.id, u.username, u."createdAt" FROM "User" u
    WHERE u.username = $1`,
    [params.username]
  );

  if (users.length === 0) {
    return (
      <>
        <NavigationBar username={(user && user.username) || ''} />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              {/* <h1>MemeCache</h1> */}
              <h1>404</h1>
              <p>
                Couldn&apos;t find a profile for <b>{params.username}</b>.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const userFromDb = users[0];

  const isCurrentUser = user?.id === userFromDb.id;
  if (!isCurrentUser) {
    return (
      <>
        <h1>404</h1>
        <p>Couldn't find that page.</p>
      </>
    );
  }

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/me/' + user?.username} text="Back" />
            <h3>Edit profile</h3>
            <div className={'card'}>
              <Row
                style={{
                  justifyContent: 'space-between',
                  flexDirection: 'row',
                }}
              >
                <Col>
                  <h5>Avatar</h5>
                  <p style={{ fontSize: '14px' }}>
                    Your profile picture must be square in dimensions, and
                    128x128 pixels or less.
                  </p>
                  <EditAvatarComponent userId={user?.id || ''} />
                </Col>
                <div style={{ marginLeft: 'auto', width: 'unset' }}>
                  <img
                    src={'/api/resource/avatar/' + userFromDb.username}
                    width={128}
                    height={128}
                    style={{ borderRadius: '100%' }}
                    // className={}
                  />
                </div>
              </Row>
            </div>
            <br />
            <div className={'card'}>
              <Row
                style={{
                  justifyContent: 'space-between',
                  flexDirection: 'row',
                }}
              >
                <Col>
                  <h5>Username</h5>
                  <p style={{ fontSize: '14px' }}>
                    Do not include explicit language in your username. Your
                    username is case sensitive.
                  </p>
                  <EditUsernameComponent
                    userId={user?.id || ''}
                    username={user?.username || ''}
                  />
                </Col>
              </Row>
            </div>
            <br />
            <div className={'card'}>
              <Row
                style={{
                  justifyContent: 'space-between',
                  flexDirection: 'row',
                }}
              >
                <Col>
                  <h5>Bio</h5>
                  <p style={{ fontSize: '14px' }}>
                    Your bio is limited to 153 characters. Please follow our{' '}
                    <span className="external-link">Content Policy</span>.
                  </p>
                  <EditBioComponent
                    userId={user?.id || ''}
                    // userBio={}
                  />
                </Col>
              </Row>
            </div>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
