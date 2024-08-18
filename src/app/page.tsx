import { db } from '@/db/db';
import styles from './main.module.scss';
import { Button } from 'react-bootstrap';
import NavigationBar from '@/components/NavigationBar';
import { getSession } from '@/auth/lib';
import { redirect } from 'next/navigation';
import FooterBar from '@/components/FooterBar';

export default async function Home() {
  const session = await getSession();
  // console.log("session", session);

  // if (!session) {
  //   redirect('/login');
  // }

  const usersResponse = await db(`SELECT * FROM "User"`);

  return (
    <>
      <NavigationBar username={session && session.user.username} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Welcome to MemeCache!</h1>

            <p>
              This is a website that allows you to upload, store, and search
              your memes, as well as curate and share your meme taste to the
              world. Discover new funny hahas, and send them to your friends.
              <br />
              <br />
              This is heavily under construction, and almost none of the above
              functionality exists. I'm working on it.
            </p>
          </div>
          {session && (
            <>
              Hello <b>{session.user.username}</b>!
            </>
          )}
          <div>
            All users created:
            <ul>
              {usersResponse.map((user) => {
                return <li key={user.id}>{user.username}</li>;
              })}
            </ul>
          </div>
          {/* <Button variant="primary">Primary</Button>{' '} */}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
