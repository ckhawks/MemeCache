import styles from '../main.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import Faq from '@/components/Faq';

export const metadata = {
  title: 'FAQ · MemeCache',
};

// The same questions as the signed-out home page, for members, who never see that page.
export default function FaqPage() {
  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <h1>FAQ</h1>
          </div>
          <Faq title="" />
        </div>
      </main>
      <FooterBar />
    </>
  );
}
