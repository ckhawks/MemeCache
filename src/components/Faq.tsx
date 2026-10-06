import Link from 'next/link';
import styles from './Faq.module.scss';

// Questions people ask before (and after) joining. On the signed-out home page and at /faq.
// Keep every answer true of the site as it is today; say "planned" for anything that isn't.
const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is MemeCache?',
    a: (
      <>
        A place to keep the memes you like and find them again. Every meme gets its text typed
        out and tagged, so you can search for one by what it says.
      </>
    ),
  },
  {
    q: 'How do I get in?',
    a: (
      <>
        It is invite-only for now. You need an invite code, usually as a sign-up link. Ask a
        member who has one, or an admin. An application, where you send in a meme or two to be
        judged, is planned.
      </>
    ),
  },
  {
    q: 'What can I post?',
    a: (
      <>
        Anything legal that is meant to be funny. NSFW is fine as long as it is labelled: pick NSFW (or gore, flashing lights, spoiler) under the preview when you upload, or add a content warning from the meme&apos;s page afterwards. Anyone can add one to any meme. Labelled memes are blurred until someone chooses to see them. AI-made memes are fine too, marked AI-made the same way; that label is shown but does not blur. No influencer or brand content, no engagement bait, and nothing that exposes a private person. If you see something that breaks these, use Report on the meme&apos;s page and a moderator will look at it.
      </>
    ),
  },
  {
    q: 'How does search find memes?',
    a: (
      <>
        By the words on each meme and by its tags. You do not need the exact wording: part of
        a phrase, half a word or a typo still finds it, and a meme tagged with what you typed
        comes first. Add tag:name to only see memes with that tag. Members write the text and
        tags, and other members check them in the <Link href="/queue">Queue</Link>; text or a
        tag that gets voted down stops counting.
      </>
    ),
  },
  {
    q: 'Can I follow or mute a tag?',
    a: (
      <>
        Yes. Every tag&apos;s page and every row on <Link href="/tags">Browse tags</Link> has Follow and Mute. Memes with a tag you follow come first under For you on Explore, and each one says which of your tags put it there. Memes with a tag you mute are hidden from Explore, the home page, Browse tags, related memes, search and the Queue, though a link straight to one still opens it. Both are private, and you can undo them on the tag&apos;s page or under Your tags when you edit your profile.
      </>
    ),
  },
  {
    q: 'Can I follow people?',
    a: (
      <>
        Yes. Follow someone from their profile or from <Link href="/users">People</Link>, which lists everyone with a few of their best memes. Their uploads then come first under For you on Explore, alongside memes with the tags you follow, each saying who or which tag put it there. They get a notification the first time you follow them. Profiles show how many followers someone has, but not who they are.
      </>
    ),
  },
  {
    q: 'Can I bring in memes from other sites?',
    a: (
      <>
        Yes. Paste a link to a post from X, Reddit, Instagram, TikTok or YouTube on the{' '}
        <Link href="/upload">Upload</Link> page and it pulls in the image or video.
      </>
    ),
  },
  {
    q: 'Can I put MemeCache on my phone like an app?',
    a: (
      <>
        Yes. On Android, open the menu under your name and tap Install app, or use Chrome&apos;s menu and Install app. On iPhone, open MemeCache in Safari, tap Share, then Add to Home Screen. Installed on Android, MemeCache also shows up in the share sheet, so you can send memes to it from other apps.
      </>
    ),
  },
  {
    q: 'What is karma?',
    a: (
      <>
        What other people give your contributions. Post karma is likes on your uploads.
        Curation karma comes from votes on tags you added and from confirmations of your
        transcriptions, and goes down when they are rejected. Your own likes and votes never
        count.
      </>
    ),
  },
  {
    q: 'Who can see what I save?',
    a: (
      <>
        Only you. Your Library is private. Uploads, tags and transcriptions are public with
        your username on them. Likes add to a meme&apos;s count but do not show who liked it.
      </>
    ),
  },
];

export default function Faq(props: { title?: string }) {
  return (
    // With its own heading it follows other content (the home page) and needs room above.
    <section className={`${styles.faq} ${props.title !== '' ? styles.spaced : ''}`}>
      {props.title !== '' && <h2 className={styles.title}>{props.title ?? 'Questions'}</h2>}
      <div className={styles.list}>
        {QUESTIONS.map((item) => (
          <details key={item.q} className={styles.item}>
            <summary className={styles.question}>{item.q}</summary>
            <p className={styles.answer}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
