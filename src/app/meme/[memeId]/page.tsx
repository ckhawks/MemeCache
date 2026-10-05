import { notFound, permanentRedirect } from 'next/navigation';
import styles from '../../main.module.scss';
import d from './MemeDetail.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import DetailMedia from './DetailMedia';
import { MemePosted, PostActions, PostAuthor } from './PostParts';
import MemeTranscriptionEditor from '@/components/MemeTranscriptionEditor';
import MemeTagsEditor from '@/components/MemeTagsEditor';
import MemeWarningsEditor from '@/components/MemeWarningsEditor';
import Comments from '@/components/Comments';
import { getUserFromAccessToken } from '@/auth/lib';
import { isAdmin, isModerator } from '@/auth/role';
import { getMeme, listRelatedMemes } from '@/db/queries/memes';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import { getKarma } from '@/db/queries/users';
import { getCurrentTranscription } from '@/db/queries/transcriptions';
import { listTagsForMeme } from '@/db/queries/tags';
import { listWarningsForMeme } from '@/db/queries/warnings';
import { listComments } from '@/db/queries/comments';
import { listMatchedMemes } from '@/db/queries/mediaHash';
import SameTemplate from './SameTemplate';
import { getTakedown } from '@/db/queries/takedowns';
import { TAKEDOWN_NOTICES } from '@/constants/takedowns';
import { displayUsername } from '@/auth/username';

export default async function MemeDetails(props: { params: Promise<{ memeId: string }> }) {
  const params = await props.params;
  const user = await getUserFromAccessToken();
  const meme = await getMeme(params.memeId, user?.id);

  if (!meme) {
    // Taken down (migration 018): say so and why, rather than pretend it never existed.
    // Its file is gone, and its tags, transcription and comments are not shown.
    const takedown = await getTakedown(params.memeId);
    if (!takedown) {
      notFound();
    }
    return (
      <>
        <NavigationBar />
        <main className={styles.main}>
          <div className={styles.content}>
            <div className={styles.description}>
              <BackButton to={'/explore'} text={'Back'} />
              <h1>Meme removed</h1>
              <p>{TAKEDOWN_NOTICES[takedown.reason]}</p>
            </div>
          </div>
        </main>
        <FooterBar />
      </>
    );
  }
  // Links from before migration 004 used the uuid. Send them to the short URL.
  if (params.memeId !== meme.slug) {
    permanentRedirect(`/meme/${meme.slug}`);
  }
  const canDelete = !!user && (user.id === meme.uploaderId || isModerator(user));

  // Loaded with the page, so the panel is complete on first paint instead of showing
  // "Loading..." while the editors fetch their own data.
  const [transcription, tags, warnings, karma, related, comments, sameTemplate] = await Promise.all([
    getCurrentTranscription(meme.id),
    listTagsForMeme(meme.id, user?.id),
    listWarningsForMeme(meme.id, user?.id),
    getKarma(meme.uploaderId),
    listRelatedMemes(meme, user?.id),
    listComments(meme.id),
    listMatchedMemes(meme.id),
  ]);

  const initialTranscription = transcription && {
    text: transcription.text,
    editedBy: transcription.editedBy,
    editedByUsername: transcription.editedByUsername,
  };

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to={'/explore'} text={'Back'} />
          </div>
          {/* The meme with its actions and comments under it, the details beside it. */}
          <div className={d.post}>
            <div className={d.frame}>
              <DetailMedia meme={meme} />
            </div>
            <div className={d.actionsArea}>
              <PostActions
                meme={meme}
                user={user}
                canDelete={canDelete}
                canTakeDown={!!user && isAdmin(user)}
              />
            </div>
            <aside className={d.side}>
              <PostAuthor username={meme.username} avatarKey={meme.avatarKey} karma={karma} />
              <MemeWarningsEditor
                memeId={meme.id}
                userId={user?.id || ''}
                initial={warnings}
                canModerate={!!user && isModerator(user)}
              />
              <MemeTranscriptionEditor plain memeId={meme.id} userId={user?.id || ''} initial={initialTranscription} />
              <MemeTagsEditor
                plain
                memeId={meme.id}
                userId={user?.id || ''}
                initial={tags}
                canModerate={!!user && isModerator(user)}
              />
              <MemePosted createdAt={meme.createdAt} viewCount={meme.viewCount} />
            </aside>
            <div className={d.commentsArea}>
              <Comments
                memeId={meme.id}
                memeSlug={meme.slug}
                initial={comments}
                viewerId={user?.id || ''}
                canModerate={!!user && isModerator(user)}
              />
            </div>
          </div>

          <SameTemplate memes={sameTemplate} />

          {related.length > 0 && (
            <section className={d.related}>
              <h2 className={d.relatedTitle}>More like this</h2>
              <GalleryMasonry memes={related} currentUserId={user?.id || ''} view="grid" />
            </section>
          )}
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
    return { title: (await getTakedown(params.memeId)) ? 'Meme removed' : 'Meme not found' };
  }

  const title = `Meme by ${displayUsername(meme.username)}`;
  const description = `Check out this meme by ${displayUsername(meme.username)}`;
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
