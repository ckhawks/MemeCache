import { notFound, permanentRedirect } from 'next/navigation';
import styles from '../../main.module.scss';
import d from './MemeDetail.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import DetailMedia from './DetailMedia';
import MemeTranscriptionEditor from '@/components/MemeTranscriptionEditor';
import MemeTagsEditor from '@/components/MemeTagsEditor';
import { MemeDetailsLarge, MemePosted } from './MemeDetailsLarge';
import { getUserFromAccessToken } from '@/auth/lib';
import { isModerator } from '@/auth/role';
import { getMeme } from '@/db/queries/memes';
import { getCurrentTranscription } from '@/db/queries/transcriptions';
import { listTagsForMeme } from '@/db/queries/tags';

export default async function MemeDetails(props: { params: Promise<{ memeId: string }> }) {
  const params = await props.params;
  const user = await getUserFromAccessToken();
  const meme = await getMeme(params.memeId, user?.id);

  if (!meme) {
    notFound();
  }
  // Links from before migration 004 used the uuid. Send them to the short URL.
  if (params.memeId !== meme.slug) {
    permanentRedirect(`/meme/${meme.slug}`);
  }

  // Loaded with the page, so the panel is complete on first paint instead of showing
  // "Loading..." while the editors fetch their own data.
  const [transcription, tags] = await Promise.all([
    getCurrentTranscription(meme.id),
    listTagsForMeme(meme.id, user?.id),
  ]);

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to={'/explore'} text={'Back'} />
          </div>
          <div className={d.layout}>
            <div className={d.frame}>
              <DetailMedia meme={meme} />
            </div>
            <aside className={d.panel}>
              <MemeDetailsLarge
                meme={meme}
                user={user}
                canDelete={!!user && (user.id === meme.uploaderId || isModerator(user))}
              />
              <MemeTranscriptionEditor
                memeId={meme.id}
                userId={user?.id || ''}
                initial={
                  transcription && {
                    text: transcription.text,
                    editedBy: transcription.editedBy,
                    editedByUsername: transcription.editedByUsername,
                  }
                }
              />
              <MemeTagsEditor memeId={meme.id} userId={user?.id || ''} initial={tags} />
              <MemePosted createdAt={meme.createdAt} />
            </aside>
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}

export async function generateMetadata(props: { params: Promise<{ memeId: string }> }) {
  const params = await props.params;
  // Read straight from the database. This used to fetch the app's own API over HTTP.
  const meme = await getMeme(params.memeId);
  if (!meme) {
    return { title: 'Meme not found' };
  }

  const title = `Meme by ${meme.username}`;
  const description = `Check out this meme by ${meme.username}`;
  const url = `${
    process.env.NEXT_PUBLIC_BASE_URL || 'https://memecache.me'
  }/meme/${meme.slug}`;

  if (meme.contentType.startsWith('video/')) {
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'video.other',
        url,
        siteName: 'MemeCache.me',
        video: {
          url: `/api/resource/${meme.id}`,
          type: meme.contentType,
        },
      },
      twitter: {
        card: 'player',
        title,
        description,
        player: `/api/resource/${meme.id}`,
      },
    };
  } else {
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [
          {
            url: `/api/resource/${meme.id}`,
          },
        ],
        type: 'article',
        url,
        siteName: 'MemeCache.me',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [`/api/resource/${meme.id}`],
      },
    };
  }
}
