// library/page.tsx

import { getProfile } from '@/db/queries/users';
import styles from '../../../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';

import { Col, Row } from 'react-bootstrap';
import FooterBar from '@/components/FooterBar';
import EditAvatarComponent from './EditAvatarComponent';
import BackButton from '@/components/BackButton';

export default async function Profile(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
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

  const userFromDb = await getProfile(params.username);

  if (!userFromDb) {
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

  const isCurrentUser = user?.id === userFromDb.id;
  if (!isCurrentUser) {
    return (
      <>
        <h1>404</h1>
        <p>Couldn&apos;t find that page.</p>
      </>
    );
  }

  const timeStamp = new Date().getTime();

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/me/' + user?.username} text="Back" />
            <h3>Edit profile</h3>
            <br />
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
                  <EditAvatarComponent />
                </Col>
                <div style={{ marginLeft: 'auto', width: 'unset' }}>
                  {/* A plain img: the query string busts the cache after an avatar change,
                      and Next 16's image optimizer rejects query strings it has not been
                      told about. Optimizing a per-user dynamic avatar gains nothing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={'/api/resource/avatar/' + userFromDb.username + '?timeStamp=' + timeStamp}
                    width={128}
                    height={128}
                    style={{ borderRadius: '100%' }}
                    alt=""
                  />
                </div>
              </Row>
            </div>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}
