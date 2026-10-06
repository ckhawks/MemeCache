'use client';

import { useState } from 'react';
import { UploadCloud } from 'react-feather';
import { Download } from 'react-feather';
import main from '../../main.module.scss';
import ds from './DesignSystem.module.scss';
import upload from '../../upload/Upload.module.scss';
import tagEditor from '@/components/MemeTagsEditor.module.scss';
import transcription from '@/components/MemeTranscriptionEditor.module.scss';
import likeStyles from '@/components/LikeButton.module.scss';
import authForm from '@/components/AuthForm.module.scss';
import LikeButton from '@/components/LikeButton';
import SaveMemeButton from '@/components/SaveMemeButton';
import SendMemeButton from '@/components/SendMemeButton';
import DeleteMemeButton from '@/components/DeleteMemeButton';
import ReportMemeButton from '@/components/ReportMemeButton';
import Tooltip from '@/components/Tooltip';
import { TagChip } from '@/components/TagChip';
import BackButton from '@/components/BackButton';
import ThemeToggle from '@/components/ThemeToggle';
import FeedViewToggle from '@/components/FeedViewToggle';
import CountBadge from '@/components/CountBadge';
import SearchBox from '@/components/SearchBox';
import SearchSnippet from '@/components/SearchSnippet';
import { GalleryMasonry } from '@/components/GalleryMasonry';
import CooldownTimer from '@/components/CooldownTimer';
import TagFollowButtons from '@/components/TagFollowButtons';
import FeedReason from '@/components/FeedReason';
import YourTags from '@/components/YourTags';
import MemeThumbStrip from '@/components/MemeThumbStrip';
import DuplicateWarning from '../../upload/DuplicateWarning';
import SessionList from '@/components/SessionList';
import TakedownButton from '@/components/TakedownButton';
import type { MemeCard } from '@/db/queries/memes';
import { WarningChip } from '@/components/WarningChip';
import { WarningToggles } from '@/components/WarningToggles';
import WarningCover from '@/components/WarningCover';
import { WarningDisplayProvider } from '@/contexts/WarningDisplayContext';
import type { ContentWarning } from '@/constants/contentWarnings';
import { CommentComposer, CommentItem } from '@/components/Comments';
import MemeRefCard from '@/components/MemeRefCard';
import MemePicker from '@/components/MemePicker';
import type { MemeComment, MemeRef } from '@/db/queries/comments';

// A meme id that does not exist: interactive examples hit the real API and get a 404, so
// clicking them shows the error and rollback paths without changing any data.
const FAKE_MEME = '00000000-0000-4000-8000-000000000000';
// The same for tags: following or muting them fails and rolls back.
const FAKE_TAG = '00000000-0000-4000-8000-000000000001';
const FAKE_TAG_2 = '00000000-0000-4000-8000-000000000002';
// And sessions: logging them out fails, and "everywhere else" is refused because none of
// them is the viewer's own.
const FAKE_SESSION = '00000000-0000-4000-8000-000000000003';
const FAKE_SESSION_2 = '00000000-0000-4000-8000-000000000004';

// The color tokens from globals.scss, in the order they are defined.
const TOKENS = [
  '--background-color',
  '--full-background-color',
  '--hover-background-color',
  '--border-color',
  '--border-color-hover',
  '--text-color',
  '--mostly-text-color',
  '--sub-text-color',
  '--danger-color',
  '--button-primary-bg-color',
  '--button-primary-color',
  '--button-secondary-bg-color',
  '--button-secondary-bg-color-hover',
  '--button-secondary-color',
  '--button-secondary-color-hover',
  '--button-success-bg-color',
  '--button-success-bg-color-hover',
  '--button-success-color',
];

function Section(props: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={ds.section}>
      <h2 className={ds.sectionTitle}>{props.title}</h2>
      {props.note && <div className={ds.caption}>{props.note}</div>}
      {props.children}
    </section>
  );
}

// Renders the same content in a light pane and a dark pane.
function Themed(props: { children: React.ReactNode }) {
  return (
    <div className={ds.themes}>
      <div className={ds.themePane} data-theme="light" data-bs-theme="light">
        <div className={ds.caption}>Light</div>
        {props.children}
      </div>
      <div className={ds.themePane} data-theme="dark" data-bs-theme="dark">
        <div className={ds.caption}>Dark</div>
        {props.children}
      </div>
    </div>
  );
}

function Labeled(props: { label: string; children: React.ReactNode }) {
  return (
    <div className={ds.labeled}>
      {props.children}
      <span className={ds.caption}>{props.label}</span>
    </div>
  );
}

// Example cooldowns relative to when the page opened: one far off, one a few seconds from
// done so the finish state can be seen.
// Example comments around the first real meme. Their Edit and Delete only change this page.
function CommentExamples(props: { memes: MemeCard[]; userId: string }) {
  const [opened] = useState(() => Date.now());
  const meme = props.memes[0];
  const ref: MemeRef | null = meme
    ? {
        id: meme.id,
        slug: meme.slug,
        contentType: meme.contentType,
        username: meme.username,
        warnings: [],
      }
    : null;
  const base: MemeComment = {
    id: '1',
    memeId: FAKE_MEME,
    authorId: props.userId,
    username: meme?.username ?? 'someone',
    avatarKey: meme?.avatarKey ?? null,
    karma: 42,
    body: 'This is the one I was looking for.',
    ref: null,
    refGone: false,
    createdAt: new Date(opened - 2 * 60_000),
    editedAt: null,
    deleted: null,
  };
  const examples: [string, MemeComment][] = [
    ['Your own, inside the edit window: Edit and Delete', base],
    [
      "Someone else's, with a meme and edited (moderators see Delete)",
      { ...base, id: '2', authorId: FAKE_MEME, body: 'Same energy', ref, editedAt: new Date(opened) },
    ],
    ['Only a meme, warned', { ...base, id: '3', authorId: FAKE_MEME, body: '', ref: ref && { ...ref, warnings: ['spoiler'] } }],
    ['Removed by a moderator', { ...base, id: '4', authorId: FAKE_MEME, body: '', deleted: 'moderator' }],
  ];
  const fail = async () => {
    throw new Error('Example only: nothing was sent.');
  };
  return (
    <>
      {examples.map(([label, comment]) => (
        <Labeled key={comment.id} label={label}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}>
            <CommentItem comment={comment} viewerId={props.userId} canModerate={false} onEdit={fail} onDelete={fail} />
          </ul>
        </Labeled>
      ))}
      {ref && (
        <Labeled label="Attached meme (MemeRefCard), and its preview in the comment box">
          <div className={ds.row}>
            <MemeRefCard meme={ref} />
            <MemeRefCard meme={ref} onRemove={() => undefined} />
          </div>
        </Labeled>
      )}
      <Labeled label="Comment box (live search; sending fails, the meme does not exist)">
        <div style={{ width: '100%' }}>
          <CommentComposer memeId={FAKE_MEME} submitLabel="Comment" onSubmit={fail} />
        </div>
      </Labeled>
      <Labeled label="Meme picker (MemePicker, live search)">
        <div style={{ width: '100%' }}>
          <MemePicker onPick={() => undefined} onClose={() => undefined} />
        </div>
      </Labeled>
    </>
  );
}

function CooldownExamples() {
  const [opened] = useState(() => Date.now());
  const day = 24 * 60 * 60 * 1000;
  return (
    <div className={ds.row} style={{ alignItems: 'stretch' }}>
      <Labeled label="Running (day 18 of 30)">
        <CooldownTimer since={new Date(opened - 18 * day)} until={new Date(opened + 12 * day)} />
      </Labeled>
      <Labeled label="Finishing (done after 10 seconds)">
        <CooldownTimer since={new Date(opened - 30 * day + 10_000)} until={new Date(opened + 10_000)} />
      </Labeled>
    </div>
  );
}

export default function DesignSystem(props: { memes: MemeCard[]; userId: string }) {
  const noVote = () => undefined;
  const [picked, setPicked] = useState<ContentWarning[]>(['nsfw']);
  // The first real meme, labelled, to show the blurred card.
  const warned = props.memes.slice(0, 1).map((meme) => ({ ...meme, warnings: ['nsfw' as const] }));

  return (
    <div className={ds.system}>
      <Section title="Color tokens" note="Defined in src/app/globals.scss. Use these, never hardcoded colors.">
        <Themed>
          <div className={ds.swatches}>
            {TOKENS.map((token) => (
              <div key={token} className={ds.swatch} title={token}>
                <span className={ds.chip} style={{ backgroundColor: `var(${token})` }} />
                <span className={ds.swatchName}>{token.replace('--', '')}</span>
              </div>
            ))}
          </div>
        </Themed>
      </Section>

      <Section title="Typography" note="Inter. Page titles are h1; card titles are 600 weight 14px.">
        <Themed>
          <h1 style={{ margin: 0 }}>Page title (h1)</h1>
          <h3 style={{ margin: 0 }}>Section heading (h3)</h3>
          <h6 style={{ margin: 0 }}>Panel heading (h6)</h6>
          <p style={{ margin: 0 }}>Body text. Memes, tags and transcriptions read at 16px.</p>
          <p style={{ margin: 0, color: 'var(--sub-text-color)', fontSize: '14px' }}>
            Secondary text: counts, dates, help text.
          </p>
          <p className={main['meme-body-date']} style={{ margin: 0 }}>
            <a className={main['meme-username']} href="#">username</a>
            <span className={main['meme-meta-separator']}>·</span>12 months ago
          </p>
        </Themed>
      </Section>

      <Section title="Buttons" note="main.module.scss: button, button-secondary, button-success, button-danger, button-small. Success is for completing or approving something.">
        <Themed>
          <div className={ds.row}>
            <Labeled label="Primary">
              <button type="button" className={main['button']}>Upload</button>
            </Labeled>
            <Labeled label="Secondary">
              <button type="button" className={`${main['button']} ${main['button-secondary']}`}>Cancel</button>
            </Labeled>
            <Labeled label="Success">
              <button type="button" className={`${main['button']} ${main['button-success']}`}>Save and next</button>
            </Labeled>
            <Labeled label="Danger">
              <button type="button" className={`${main['button']} ${main['button-danger']}`}>Delete</button>
            </Labeled>
            <Labeled label="Small">
              <button type="button" className={`${main['button']} ${main['button-secondary']} ${main['button-small']}`}>
                Change
              </button>
            </Labeled>
            <Labeled label="Disabled">
              <button type="button" className={main['button']} disabled>
                Uploading…
              </button>
            </Labeled>
          </div>
        </Themed>
      </Section>

      <Section
        title="Icon buttons and tooltips"
        note="Card and meme-page actions. Hover for the tooltip. These point at a meme that does not exist: clicks fail and roll back."
      >
        <Themed>
          <div className={ds.row}>
            <Labeled label="Delete">
              <DeleteMemeButton memeId={FAKE_MEME} />
            </Labeled>
            <Labeled label="Download">
              <Tooltip label="Download">
                <a href="#" aria-label="Download" className={likeStyles['wrapper']} onClick={(e) => e.preventDefault()}>
                  <Download size={14} className={likeStyles['icon']} />
                </a>
              </Tooltip>
            </Labeled>
            <Labeled label="Send">
              <SendMemeButton memeId={FAKE_MEME} slug="Xm7Kq2N" contentType="image/png" />
            </Labeled>
            <Labeled label="Save / Saved">
              <div className={ds.row}>
                <SaveMemeButton memeId={FAKE_MEME} saved={false} />
                <SaveMemeButton memeId={FAKE_MEME} saved />
              </div>
            </Labeled>
            <Labeled label="Like / Liked / Signed out">
              <div className={ds.row}>
                <LikeButton memeId={FAKE_MEME} userId={props.userId} liked={false} likes={3} />
                <LikeButton memeId={FAKE_MEME} userId={props.userId} liked likes={4} />
                <LikeButton memeId={FAKE_MEME} userId="" liked={false} likes={3} />
              </div>
            </Labeled>
            <Labeled label="Report (meme page only, opens the form)">
              <ReportMemeButton memeId={FAKE_MEME} />
            </Labeled>
          </div>
        </Themed>
      </Section>

      <Section title="Tags" note="Hover a chip for its vote arrows (always shown on touch screens). Zero or below reads as unconfirmed.">
        <Themed>
          <div className={ds.row}>
            <Labeled label="Votable">
              <TagChip tag={{ id: FAKE_MEME, name: 'cat', score: 3 }} onVote={noVote} />
            </Labeled>
            <Labeled label="Your own">
              <TagChip tag={{ id: FAKE_MEME, name: 'loaf', score: 1 }} onVote={noVote} disableVote />
            </Labeled>
            <Labeled label="Unconfirmed">
              <TagChip tag={{ id: FAKE_MEME, name: 'dog', score: 0 }} onVote={noVote} />
            </Labeled>
          </div>
        </Themed>
      </Section>

      <Section
        title="Follow and mute"
        note="components/TagFollowButtons on the tag page (with its note line) and each Browse tags row. Muting a followed tag replaces the follow. YourTags is the list on the edit profile page. These point at tags that do not exist: clicks fail and roll back."
      >
        <Themed>
          <div className={ds.row}>
            <Labeled label="Neither">
              <TagFollowButtons tagId={FAKE_TAG} tagName="cats" preference={null} />
            </Labeled>
            <Labeled label="Following, with note">
              <TagFollowButtons tagId={FAKE_TAG} tagName="cats" preference="follow" note />
            </Labeled>
            <Labeled label="Muted, with note">
              <TagFollowButtons tagId={FAKE_TAG} tagName="cats" preference="mute" note />
            </Labeled>
          </div>
          <Labeled label="Your tags">
            <YourTags
              tags={[
                { id: FAKE_TAG, name: 'cats', kind: 'follow' },
                { id: FAKE_TAG_2, name: 'politics', kind: 'mute' },
              ]}
            />
          </Labeled>
        </Themed>
      </Section>

      <Section
        title="Sessions"
        note="components/SessionList, the &quot;Where you're logged in&quot; card on the edit profile page. These sessions do not exist: every button fails and nothing is logged out."
      >
        <Themed>
          <SessionList
            sessions={[
              {
                id: FAKE_SESSION,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
                network: '203.0.113.0/24',
                createdAt: '2026-01-01T12:00:00.000Z',
                lastSeenAt: '2026-01-08T11:58:00.000Z',
              },
              {
                id: FAKE_SESSION_2,
                userAgent:
                  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
                network: null,
                createdAt: '2026-01-03T09:00:00.000Z',
                lastSeenAt: '2026-01-06T20:00:00.000Z',
              },
            ]}
            currentId={FAKE_SESSION}
            now="2026-01-08T12:00:00.000Z"
          />
        </Themed>
      </Section>

      <Section
        title="Take down"
        note="components/TakedownButton, admins only, in the meme page's actions beside Delete. Deletes the file and leaves a notice. This one points at a meme that does not exist."
      >
        <Themed>
          <div className={ds.row}>
            <TakedownButton memeId={FAKE_MEME} />
          </div>
        </Themed>
      </Section>

      <Section
        title="Feed reasons"
        note="components/FeedReason, under each card in For you: the followed people and tags that put it there, or a plain line for the memes after them."
      >
        <Themed>
          <FeedReason followedUsers={[]} followedTags={['cats']} />
          <FeedReason followedUsers={['alice']} followedTags={['cats']} />
          <FeedReason followedUsers={[]} followedTags={['cats', 'dogs', 'loaf']} />
          <FeedReason followedUsers={[]} followedTags={[]} />
        </Themed>
      </Section>

      <Section
        title="Content warnings"
        note="A warning chip looks like a tag chip with an icon: no score, no link, and the remove button in the same hover popover. The type buttons are plain small buttons, primary when on (upload and the meme page)."
      >
        <Themed>
          <div className={ds.row}>
            <Labeled label="Removable (yours, or as a moderator)">
              <WarningChip warning="nsfw" onRemove={noVote} />
            </Labeled>
            <Labeled label="Someone else's">
              <WarningChip warning="spoiler" hint="Added by someone" />
            </Labeled>
          </div>
          <Labeled label="Type buttons">
            <WarningToggles
              selected={picked}
              onToggle={(warning) =>
                setPicked((current) =>
                  current.includes(warning) ? current.filter((w) => w !== warning) : [...current, warning]
                )
              }
            />
          </Labeled>
        </Themed>
      </Section>

      <Section
        title="Blurred memes"
        note="WarningCover. Shown here with the blur setting whatever yours is: click a card's cover to reveal that one meme. Thumbnails (browse tags) show only the label and open the meme page."
      >
        {/* Fixed to 'blur' so the example shows even for an admin who never blurs. */}
        <WarningDisplayProvider display="blur">
          {warned.length > 0 && (
            <div className={ds.row} style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 320 }}>
                <GalleryMasonry memes={warned} currentUserId={props.userId} view="feed" />
              </div>
              <Labeled label="Thumbnail">
                <div style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden' }}>
                  <WarningCover compact warnings={['gore', 'spoiler']} style={{ height: '100%' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/resource/${warned[0].id}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </WarningCover>
                </div>
              </Labeled>
            </div>
          )}
        </WarningDisplayProvider>
      </Section>

      <Section title="Inputs">
        <Themed>
          <Labeled label="Search (SearchBox; compact is the top bar's, live: submits to /search)">
            <div className={ds.row}>
              <SearchBox />
              <SearchBox compact />
            </div>
          </Labeled>
          <Labeled label="Search result text (SearchSnippet)">
            <SearchSnippet text={'My disappointment is immeasurable, and my day is ruined.'} />
          </Labeled>
          <div className={ds.row}>
            <input type="text" placeholder="Add a new tag" aria-label="Example tag input" className={tagEditor['tag-input']} />
            <button type="button" className={main['button']}>Add tag</button>
          </div>
          <textarea
            aria-label="Example transcription"
            className={transcription['transcription-area']}
            rows={2}
            defaultValue="Transcription text area"
          />
          <select aria-label="Example dropdown" className={authForm['select']} defaultValue="">
            <option value="" disabled>
              Dropdown (AuthForm.module.scss select)
            </option>
            <option value="a">First option</option>
            <option value="b">Second option</option>
          </select>
        </Themed>
      </Section>

      <Section
        title="Comments"
        note="components/Comments: flat, oldest first. Text and/or a meme replied with, shown as a MemeRefCard thumbnail that respects content warnings. Edit for 10 minutes; delete leaves a note in place."
      >
        <Themed>
          <CommentExamples memes={props.memes} userId={props.userId} />
        </Themed>
      </Section>

      <Section title="Feedback text">
        <Themed>
          <div className={upload.note}>A note: something worth knowing, not an error.</div>
          <div className={upload.error}>An error: what went wrong and what to do.</div>
          <p style={{ margin: 0, color: 'var(--sub-text-color)' }}>An empty state: nothing here yet, and how to fill it.</p>
        </Themed>
      </Section>

      <Section
        title="Cooldown timer"
        note="components/CooldownTimer. Ticks every second, digits drop in as they change, the bar fills toward the unlock. Motion stops under prefers-reduced-motion. Used for the username cooldown."
      >
        <Themed>
          <CooldownExamples />
        </Themed>
      </Section>

      <Section title="Navigation bits">
        <Themed>
          <div className={ds.row}>
            <Labeled label="Back">
              <BackButton to="/admin/design" text="Back" />
            </Labeled>
            <Labeled label="Layout toggle (live: sets your gallery layout)">
              <FeedViewToggle view="grid" />
            </Labeled>
            <Labeled label="Theme toggle (live)">
              <ThemeToggle />
            </Labeled>
            <Labeled label="Pager">
              <span className={`${main['button']} ${main['button-secondary']}`}>Older memes</span>
            </Labeled>
            <Labeled label="Count badge (CountBadge: unread notifications; nothing at 0, 99+ past 99)">
              <div className={ds.row}>
                <CountBadge count={3} />
                <CountBadge count={42} />
                <CountBadge count={250} />
              </div>
            </Labeled>
          </div>
        </Themed>
      </Section>

      <Section title="Upload drop zone" note="Static copy of the empty upload state.">
        <Themed>
          <div className={upload.dropzone} style={{ minHeight: 180 }}>
            <UploadCloud size={36} className={upload.dropIcon} />
            <div className={upload.dropTitle}>Drop a meme here</div>
            <div className={upload.muted}>
              or <span className={upload.linkish}>browse</span>, or paste with Ctrl+V
            </div>
          </div>
        </Themed>
      </Section>

      <Section
        title="Meme thumbnail strip"
        note="MemeThumbStrip: square links to memes. Medium is a page section (Same template on a meme page); small sits inside a notice, like the upload page's duplicate warning below it."
      >
        <Themed>
          <MemeThumbStrip memes={props.memes} />
          <MemeThumbStrip memes={props.memes} size="small" />
          <DuplicateWarning memes={props.memes.slice(0, 1)} />
        </Themed>
      </Section>

      <Section title="Cards: grid" note="Real memes from Explore. Their actions are live.">
        <GalleryMasonry memes={props.memes} currentUserId={props.userId} view="grid" />
      </Section>

      <Section title="Cards: feed" note="The single-column layout.">
        <GalleryMasonry memes={props.memes.slice(0, 1)} currentUserId={props.userId} view="feed" />
      </Section>

      <Section title="Cards: For you" note="GalleryMasonry with reasons, as Explore's For you passes them.">
        <GalleryMasonry
          memes={props.memes}
          currentUserId={props.userId}
          view="grid"
          reasons={Object.fromEntries(
            props.memes.map((meme, i) => [
              meme.id,
              {
                followedUsers: i === 1 ? [meme.username] : [],
                followedTags: i === 0 ? ['cats'] : [],
              },
            ])
          )}
        />
      </Section>
    </div>
  );
}
