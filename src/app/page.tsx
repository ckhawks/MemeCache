import { db } from '@/db/db';
import styles from './main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import { getUserFromAccessToken } from '@/auth/lib';
import FooterBar from '@/components/FooterBar';

export default async function Home() {
  const user = await getUserFromAccessToken();

  const usersResponse = await db(`SELECT * FROM "User"`);

  return (
    <>
      <NavigationBar username={(user && user.username) || ''} />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>Welcome to MemeCache!</h1>

            {user && (
              <>
                Hello <b>{user.username}</b>!
              </>
            )}
            <p>
              MemeCache allows you to upload, store, and search your memes, as
              well as curate and share your meme taste to the world. Discover
              new cringe funny hahas, and send them to your friends.
              <br />
              <br />
              This is heavily under construction, and almost none of the above
              functionality exists. I&apos;m working on it.
            </p>
          </div>

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
