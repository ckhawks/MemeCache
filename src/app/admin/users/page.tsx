import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'react-feather';
import styles from '../../main.module.scss';
import u from './Users.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import ModerateUserButton from '@/components/ModerateUserButton';
import { requireAdmin } from '@/server/requireAdmin';
import {
  isAdminUserSort,
  listUsersForAdmin,
  type AdminUserRow,
  type AdminUserSort,
} from '@/db/queries/userLists';
import { avatarUrl } from '@/util/avatarUrl';
import { timeAgo } from '@/util/datetimeFormat';

export const metadata = {
  title: 'Users',
};

const PER_PAGE = 50;

// Text columns read best A to Z; numbers and dates biggest or newest first.
const ASCENDING_FIRST: AdminUserSort[] = ['username'];

const COLUMNS: { sort: AdminUserSort | null; label: string; numeric?: boolean }[] = [
  { sort: 'username', label: 'User' },
  { sort: 'role', label: 'Role' },
  { sort: 'joined', label: 'Joined' },
  { sort: 'active', label: 'Last active' },
  { sort: 'uploads', label: 'Uploads', numeric: true },
  { sort: 'post', label: 'Post karma', numeric: true },
  { sort: 'curation', label: 'Curation karma', numeric: true },
  { sort: 'followers', label: 'Followers', numeric: true },
  { sort: 'trust', label: 'Trust' },
  { sort: null, label: 'Invite code' },
  { sort: null, label: '' },
];

interface Params {
  sort: AdminUserSort;
  dir: 'asc' | 'desc';
  q: string;
  deleted: boolean;
  page: number;
}

// Every search param the page reads, so each link keeps the others.
function href(params: Params, change: Partial<Params>) {
  const next = { ...params, ...change };
  const search = new URLSearchParams();
  if (next.sort !== 'joined') {
    search.set('sort', next.sort);
  }
  if (next.dir !== defaultDir(next.sort)) {
    search.set('dir', next.dir);
  }
  if (next.q) {
    search.set('q', next.q);
  }
  if (next.deleted) {
    search.set('deleted', '1');
  }
  if (next.page > 0) {
    search.set('page', String(next.page));
  }
  const query = search.toString();
  return '/admin/users' + (query ? '?' + query : '');
}

function defaultDir(sort: AdminUserSort): 'asc' | 'desc' {
  return ASCENDING_FIRST.includes(sort) ? 'asc' : 'desc';
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function trustLabel(row: AdminUserRow) {
  if (row.trustOverride === 'held') {
    return 'Held (set by admin)';
  }
  if (row.trustOverride === 'trusted') {
    return 'Trusted (set by admin)';
  }
  return row.held ? 'Held' : 'Automatic';
}

// Every account, admins only. Sorting, the username filter, showing deleted accounts and the
// page are all search params, so the server renders each view and any of them can be linked.
export default async function AdminUsers(props: {
  searchParams: Promise<{ sort?: string; dir?: string; q?: string; deleted?: string; page?: string }>;
}) {
  const user = await requireAdmin();
  const searchParams = await props.searchParams;
  const sort = isAdminUserSort(searchParams.sort) ? searchParams.sort : 'joined';
  const params: Params = {
    sort,
    dir: searchParams.dir === 'asc' || searchParams.dir === 'desc' ? searchParams.dir : defaultDir(sort),
    q: (searchParams.q ?? '').trim().slice(0, 64),
    deleted: searchParams.deleted === '1',
    page: Math.max(0, Math.floor(Number(searchParams.page) || 0)),
  };
  const { rows, total } = await listUsersForAdmin({
    sort: params.sort,
    dir: params.dir,
    query: params.q,
    includeDeleted: params.deleted,
    page: params.page,
    perPage: PER_PAGE,
  });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const secondary = `${styles.button} ${styles['button-secondary']} ${styles['button-small']}`;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to="/admin" text="Admin" />
            <h1>Users</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Every account. Sort by any column with a heading link, and moderate someone from their row.
            </p>
          </div>

          <div className={u.toolbar}>
            <form action="/admin/users" method="get" className={u.search} role="search">
              {params.sort !== 'joined' && <input type="hidden" name="sort" value={params.sort} />}
              {params.dir !== defaultDir(params.sort) && <input type="hidden" name="dir" value={params.dir} />}
              {params.deleted && <input type="hidden" name="deleted" value="1" />}
              <input
                type="search"
                name="q"
                defaultValue={params.q}
                placeholder="Filter by username"
                aria-label="Filter by username"
                className={u.searchInput}
                maxLength={64}
              />
              <button type="submit" className={secondary}>
                Filter
              </button>
            </form>
            <Link href={href(params, { deleted: !params.deleted, page: 0 })} className={secondary}>
              {params.deleted ? 'Hide deleted accounts' : 'Show deleted accounts'}
            </Link>
            <span className={u.total}>
              {total.toLocaleString()} {total === 1 ? 'account' : 'accounts'}
            </span>
          </div>

          {/* Wide on purpose: on phones it scrolls sideways inside this box, never the page. */}
          <div className={u.tableWrap}>
            <table className={u.table}>
              <thead>
                <tr>
                  {COLUMNS.map((column, i) => {
                    if (!column.sort) {
                      return (
                        <th key={i} scope="col">
                          {column.label}
                        </th>
                      );
                    }
                    const active = params.sort === column.sort;
                    // Pressing the current column flips it; another starts in its usual direction.
                    const dir = active ? (params.dir === 'asc' ? 'desc' : 'asc') : defaultDir(column.sort);
                    return (
                      <th
                        key={column.sort}
                        scope="col"
                        className={column.numeric ? u.numeric : undefined}
                        aria-sort={active ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <Link
                          href={href(params, { sort: column.sort, dir, page: 0 })}
                          className={active ? `${u.sortLink} ${u.sorted}` : u.sortLink}
                        >
                          {column.label}
                          {active && (params.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className={u.empty}>
                      {params.q ? `No accounts with "${params.q}" in their name.` : 'No accounts.'}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className={row.deletedAt ? u.deleted : undefined}>
                    <td>
                      <Link href={'/me/' + encodeURIComponent(row.username)} className={u.user}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={avatarUrl(row.username, row.avatarKey)} alt="" width={28} height={28} className={u.avatar} />
                        {row.deletedAt ? 'Deleted user' : row.username}
                      </Link>
                    </td>
                    <td>{row.role === 'user' ? 'Member' : row.role === 'admin' ? 'Admin' : 'Moderator'}</td>
                    <td>{row.createdAt ? formatDate(row.createdAt) : <span className={u.muted}>Unknown</span>}</td>
                    <td>
                      {row.lastActive ? (
                        <span title={formatDate(row.lastActive)}>{timeAgo(row.lastActive)}</span>
                      ) : (
                        <span className={u.muted}>Never</span>
                      )}
                    </td>
                    <td className={u.numeric}>{row.uploads.toLocaleString()}</td>
                    <td className={u.numeric}>{row.postKarma.toLocaleString()}</td>
                    <td className={u.numeric}>{row.curationKarma.toLocaleString()}</td>
                    <td className={u.numeric}>{row.followers.toLocaleString()}</td>
                    <td className={row.held ? u.held : undefined}>{trustLabel(row)}</td>
                    <td>{row.inviteCode ? <code>{row.inviteCode}</code> : <span className={u.muted}>None</span>}</td>
                    <td>
                      {/* Nothing to do to a deleted account, and an admin's own goes through their edit page. */}
                      {!row.deletedAt && row.id !== user.id && (
                        <ModerateUserButton
                          userId={row.id}
                          username={row.username}
                          trust={{ override: row.trustOverride, held: row.held }}
                          stayOnPage
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className={u.pager} aria-label="Pages">
              {params.page > 0 && (
                <Link href={href(params, { page: params.page - 1 })} className={secondary}>
                  Previous
                </Link>
              )}
              <span className={u.total}>
                Page {params.page + 1} of {pages}
              </span>
              {params.page + 1 < pages && (
                <Link href={href(params, { page: params.page + 1 })} className={secondary}>
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </main>
      <FooterBar />
    </>
  );
}
