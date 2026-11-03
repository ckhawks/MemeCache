'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import l from './Live.module.scss';
import ConcurrencyChart from './ConcurrencyChart';
import type { ActivityRow, TrafficNumbers } from '@/db/queries/events';
import type { ConcurrencyPoint, ConcurrencyRange, PresentPerson, VisitStats } from '@/db/queries/visits';
import type { NewMember, RetentionCohort, UnclickedSearch } from '@/db/queries/analytics';

interface LiveData {
  now: number;
  present: PresentPerson[];
  activity: ActivityRow[];
  concurrency: ConcurrencyPoint[];
}

interface SummaryData {
  traffic: TrafficNumbers;
  visits: VisitStats;
  retention: RetentionCohort[];
  newMembers: NewMember[];
  unclickedSearches: UnclickedSearch[];
}

const RANGES: { value: ConcurrencyRange; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load.');
  }
  return response.json();
};

function ms(date: Date | string | null) {
  return date === null ? null : new Date(date).getTime();
}

// "12s", "4m", "3h", "2d": short, since every row has one.
function span(seconds: number) {
  seconds = Math.max(0, Math.round(seconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

function ago(from: Date | string, now: number) {
  return span((now - new Date(from).getTime()) / 1000);
}

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function Who({ username, visitor }: { username: string | null; visitor: string | null }) {
  if (username) {
    return (
      <Link href={'/me/' + encodeURIComponent(username)} className={l.who}>
        {username}
      </Link>
    );
  }
  return <span className={l.visitor}>Visitor {visitor ?? ''}</span>;
}

function MemeLink({ slug }: { slug: string | null }) {
  return slug ? <Link href={`/meme/${slug}`}>a meme</Link> : <>a meme</>;
}

// What one event says, after the person's name.
function describe(row: ActivityRow) {
  const query = str(row.data.query);
  switch (row.kind) {
    case 'page_view':
      return (
        <>
          opened <Link href={str(row.data.path)}>{str(row.data.path)}</Link>
          {row.data.referrer ? <span className={l.muted}> from {str(row.data.referrer)}</span> : null}
        </>
      );
    case 'register':
      return <>signed up</>;
    case 'search':
      return (
        <>
          searched &ldquo;{query}&rdquo;
          <span className={l.muted}> {Number(row.data.results ?? 0).toLocaleString()} found</span>
        </>
      );
    case 'search_click':
      return (
        <>
          opened <MemeLink slug={row.memeSlug} /> from a search for &ldquo;{query}&rdquo;
        </>
      );
    case 'meme_send':
      return (
        <>
          tapped Send on <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'share':
      return (
        <>
          shared <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'meme_copy_link':
      return (
        <>
          copied the link to <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'meme_download':
      return (
        <>
          downloaded <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'upload':
      return (
        <>
          uploaded <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'upload_refused':
      return (
        <>
          tried to upload a copy of <MemeLink slug={row.memeSlug} />
        </>
      );
    case 'import':
      return (
        <>
          imported a link from {str(row.data.site) || 'somewhere'}
          <span className={l.muted}> {str(row.data.outcome)}</span>
        </>
      );
    default:
      return <>{row.kind}</>;
  }
}

function Tiles({ tiles }: { tiles: { label: string; value: string; note?: string }[] }) {
  return (
    <div className={l.tiles}>
      {tiles.map((tile) => (
        <div key={tile.label} className={l.tile}>
          <div className={l.tileNumber}>{tile.value}</div>
          <div className={l.tileLabel}>{tile.label}</div>
          {tile.note && <div className={l.tileNote}>{tile.note}</div>}
        </div>
      ))}
    </div>
  );
}

function Ranked({ rows, empty }: { rows: { key: string; label: React.ReactNode; value: number }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className={l.muted}>{empty}</p>;
  }
  return (
    <ol className={l.ranked}>
      {rows.map((row) => (
        <li key={row.key}>
          {row.label}
          <span className={l.muted}>{row.value.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

// How long after joining someone first did a thing, or a dash. The oldest accounts have no
// signup date, so for them it is the date it happened.
function Milestone({ at, joinedAt }: { at: Date | null; joinedAt: Date | null }) {
  const done = ms(at);
  if (done === null) {
    return <span className={l.muted}>-</span>;
  }
  const date = new Date(done).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  if (joinedAt === null) {
    return <span>{date}</span>;
  }
  return <span title={date}>after {span((done - new Date(joinedAt).getTime()) / 1000)}</span>;
}

function NewMembers({ members, now }: { members: NewMember[]; now: number }) {
  const counts = {
    upload: members.filter((m) => m.firstUploadAt).length,
    like: members.filter((m) => m.firstLikeAt).length,
    send: members.filter((m) => m.firstSendAt).length,
    search: members.filter((m) => m.firstSearchAt).length,
  };
  return (
    <>
      <p className={l.muted}>
        Of the newest {members.length}: {counts.upload} have uploaded, {counts.like} liked, {counts.send} sent, {counts.search} searched.
      </p>
      <div className={l.tableWrap}>
        <table className={l.table}>
          <thead>
            <tr>
              <th>Member</th>
              <th>Joined</th>
              <th>First upload</th>
              <th>First like</th>
              <th>First send</th>
              <th>First search</th>
              <th>Uploads</th>
              <th>Visits</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.username}>
                <td>
                  <Who username={m.username} visitor={null} />
                </td>
                <td>{m.joinedAt ? `${ago(m.joinedAt, now)} ago` : <span className={l.muted}>-</span>}</td>
                <td>
                  <Milestone at={m.firstUploadAt} joinedAt={m.joinedAt} />
                </td>
                <td>
                  <Milestone at={m.firstLikeAt} joinedAt={m.joinedAt} />
                </td>
                <td>
                  <Milestone at={m.firstSendAt} joinedAt={m.joinedAt} />
                </td>
                <td>
                  <Milestone at={m.firstSearchAt} joinedAt={m.joinedAt} />
                </td>
                <td>{m.uploads}</td>
                <td>{m.visits}</td>
                <td className={l.muted}>{m.lastSeenAt ? `${ago(m.lastSeenAt, now)} ago` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={l.footnote}>
        Likes, uploads and searches count from whenever they were made; sends from Oct 5, 2026, and visits from when this page shipped.
      </p>
    </>
  );
}

function Retention({ cohorts }: { cohorts: RetentionCohort[] }) {
  const weeks = cohorts[0]?.active.length ?? 0;
  return (
    <>
      <div className={l.tableWrap}>
        <table className={l.table}>
          <thead>
            <tr>
              <th>Signed up, week of</th>
              <th>Members</th>
              {Array.from({ length: weeks }, (_, i) => (
                <th key={i}>Week {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={String(cohort.week)}>
                <td>{new Date(cohort.week).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</td>
                <td>{cohort.size}</td>
                {cohort.active.map((active, i) => (
                  <td key={i} className={active === null ? l.muted : undefined}>
                    {active === null ? '' : `${active} (${percent(active / cohort.size)})`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={l.footnote}>
        Week 1 is days 7 to 13 after each person signed up. A blank cell has not finished yet, or fell before daily activity was recorded (Oct 5, 2026).
      </p>
    </>
  );
}

export default function LiveDashboard() {
  const [pageViews, setPageViews] = useState(false);
  const [range, setRange] = useState<ConcurrencyRange>('day');
  const live = useSWR<LiveData>(`/api/admin/live?range=${range}${pageViews ? '&pageViews=1' : ''}`, fetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  });
  const summary = useSWR<SummaryData>('/api/admin/live/summary', fetcher, {
    refreshInterval: 60_000,
  });

  if (live.error && !live.data) {
    return <p className={l.muted}>Could not load the live view.</p>;
  }
  if (!live.data) {
    return <p className={l.muted}>Loading...</p>;
  }

  const { now, present, activity, concurrency } = live.data;
  const members = present.filter((p) => p.username).length;
  const s = summary.data;

  return (
    <div className={l.live}>
      <Tiles
        tiles={[
          { label: 'On the site now', value: present.length.toLocaleString(), note: `${plural(members, 'member', 'members')}, ${plural(present.length - members, 'visitor', 'visitors')}` },
          ...(s
            ? [
                { label: 'People, last 24 hours', value: s.traffic.visitorsDay.toLocaleString(), note: plural(s.traffic.membersDay, 'member', 'members') },
                { label: 'Page views, last 24 hours', value: s.traffic.viewsDay.toLocaleString() },
                { label: 'People, last 7 days', value: s.traffic.visitorsWeek.toLocaleString() },
                {
                  label: 'Most at once, last 7 days',
                  value: s.visits.peakWeek.toLocaleString(),
                  note: s.visits.peakWeekAt ? new Date(s.visits.peakWeekAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : undefined,
                },
                { label: 'Signups, last 7 days', value: s.traffic.signupsWeek.toLocaleString() },
              ]
            : []),
        ]}
      />

      <section>
        <h2 className={l.heading}>
          <span className={l.dot} aria-hidden="true" />
          On the site now
        </h2>
        {present.length === 0 ? (
          <p className={l.muted}>Nobody has a tab open.</p>
        ) : (
          <div className={l.tableWrap}>
            <table className={l.table}>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Page</th>
                  <th>Device</th>
                  <th>From</th>
                  <th>Here for</th>
                  <th>Pages</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {present.map((p) => (
                  <tr key={(p.username ?? p.visitor) + String(p.startedAt)}>
                    <td>
                      <Who username={p.username} visitor={p.visitor} />
                    </td>
                    <td>
                      <Link href={p.path}>{p.path}</Link>
                    </td>
                    <td>
                      {p.device}
                      {p.installed && <span className={l.muted}> (app)</span>}
                    </td>
                    <td className={l.muted}>{p.referrer ?? ''}</td>
                    <td>{span((ms(p.lastSeenAt)! - ms(p.startedAt)!) / 1000)}</td>
                    <td>{p.pages}</td>
                    <td className={l.muted}>{ago(p.lastSeenAt, now)} ago</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className={l.sectionHeader}>
          <h2 className={l.heading}>People on the site</h2>
          <div className={l.segmented} role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={r.value === range ? l.segmentActive : l.segment}
                aria-pressed={r.value === range}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ConcurrencyChart points={concurrency} range={range} />
      </section>

      <section>
        <div className={l.sectionHeader}>
          <h2 className={l.heading}>Activity</h2>
          <label className={l.toggle}>
            <input type="checkbox" checked={pageViews} onChange={(event) => setPageViews(event.target.checked)} />
            Include page views
          </label>
        </div>
        {activity.length === 0 ? (
          <p className={l.muted}>Nothing yet.</p>
        ) : (
          <ol className={l.feed}>
            {activity.map((row) => (
              <li key={row.id}>
                <span className={l.when}>{ago(row.createdAt, now)}</span>
                <span>
                  <Who username={row.username} visitor={row.visitor} /> {describe(row)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {s && (
        <>
          <section>
            <h2 className={l.heading}>Visits, last 30 days</h2>
            <Tiles
              tiles={[
                { label: 'Visits', value: s.visits.visits.toLocaleString(), note: plural(s.visits.people, 'person', 'people') },
                { label: 'Typical visit', value: s.visits.medianSeconds === null ? '-' : span(s.visits.medianSeconds), note: 'the middle one' },
                { label: 'Pages per visit', value: s.visits.medianPages === null ? '-' : String(s.visits.medianPages), note: 'the middle one' },
                { label: 'Left after one page', value: percent(s.visits.bounceShare), note: 'within 10 seconds' },
                { label: 'Returning', value: percent(s.visits.returningShare), note: 'not their first visit' },
                { label: 'In the installed app', value: percent(s.visits.installedShare) },
              ]}
            />
            <div className={l.columns}>
              <div>
                <h3 className={l.subheading}>Where visits start</h3>
                <Ranked
                  rows={s.visits.topEntries.map((r) => ({ key: r.path, label: <Link href={r.path}>{r.path}</Link>, value: r.visits }))}
                  empty="None yet."
                />
              </div>
              <div>
                <h3 className={l.subheading}>Where visits end</h3>
                <Ranked
                  rows={s.visits.topExits.map((r) => ({ key: r.path, label: <Link href={r.path}>{r.path}</Link>, value: r.visits }))}
                  empty="None yet."
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className={l.heading}>New members</h2>
            <NewMembers members={s.newMembers} now={now} />
          </section>

          <section>
            <h2 className={l.heading}>Who keeps coming back</h2>
            <Retention cohorts={s.retention} />
          </section>

          <div className={l.columns}>
            <section>
              <h2 className={l.heading}>Searches where nothing was opened, last 30 days</h2>
              <p className={l.footnote}>They found something, but no result was opened within 10 minutes.</p>
              <Ranked
                rows={s.unclickedSearches.map((r) => ({
                  key: r.query,
                  label: (
                    <span>
                      {r.query} <span className={l.muted}>({r.results} found)</span>
                    </span>
                  ),
                  value: r.count,
                }))}
                empty="None."
              />
            </section>
            <section>
              <h2 className={l.heading}>Top pages, last 24 hours</h2>
              <Ranked
                rows={s.traffic.topPages.map((r) => ({ key: r.path, label: <Link href={r.path}>{r.path}</Link>, value: r.views }))}
                empty="None yet."
              />
            </section>
            <section>
              <h2 className={l.heading}>Sites people came from, last 7 days</h2>
              <Ranked
                rows={s.traffic.topReferrers.map((r) => ({ key: r.host, label: <span>{r.host}</span>, value: r.visits }))}
                empty="None yet."
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
