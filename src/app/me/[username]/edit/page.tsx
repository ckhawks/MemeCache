// library/page.tsx

import { getProfile } from '@/db/queries/users';
import styles from '../../../main.module.scss';
import { notFound } from 'next/navigation';
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

  if (!params.username) {
    notFound();
  }

  const userFromDb = await getProfile(params.username);

  if (!userFromDb) {
    notFound();
  }

  const isCurrentUser = user?.id === userFromDb.id;
  // Someone else's edit page does not exist as far as this visitor is concerned.
  if (!isCurrentUser) {
    notFound();
  }

  const timeStamp = new Date().getTime();

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* <h1>MemeCache</h1> */}
            <BackButton to={'/me/' + user?.username} text="Back" />
            <h1>Edit profile</h1>
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
