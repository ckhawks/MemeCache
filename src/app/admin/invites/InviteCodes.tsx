'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Link as LinkIcon, Plus } from 'react-feather';
import main from '../../main.module.scss';
import f from '@/components/AuthForm.module.scss';
import s from './InviteCodes.module.scss';
import { api } from '@/util/api';
import type { InviteCode, InviteStatus } from '@/db/queries/invites';

const STATUS_LABELS: Record<InviteStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  expired: 'Expired',
  'used-up': 'Used up',
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function NewInviteForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expires, setExpires] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api('/api/admin/invites', {
        body: {
          code: code.trim() || undefined,
          note: note.trim() || undefined,
          maxUses: maxUses === '' ? null : Number(maxUses),
          // The end of that day where the admin is.
          expiresAt: expires === '' ? null : new Date(`${expires}T23:59:59`).toISOString(),
        },
      });
      setCode('');
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the code.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={create} className={s.form}>
      {error && (
        <div className={f.error} aria-live="polite">
          {error}
        </div>
      )}
      <div className={s.fields}>
        <div className={f.field}>
          <label htmlFor="invite-note" className={f.label}>
            Note
          </label>
          <input
            id="invite-note"
            className={f.input}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Who or what it is for"
          />
        </div>
        <div className={f.field}>
          <label htmlFor="invite-code" className={f.label}>
            Code
          </label>
          <input
            id="invite-code"
            className={f.input}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={32}
            autoComplete="off"
            placeholder="Leave empty to generate one"
          />
          <span className={f.hint}>Letters, digits, dashes or underscores. Case does not matter.</span>
        </div>
        <div className={f.field}>
          <label htmlFor="invite-max-uses" className={f.label}>
            Max uses
          </label>
          <input
            id="invite-max-uses"
            className={f.input}
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <span className={f.hint}>Leave empty for no limit.</span>
        </div>
        <div className={f.field}>
          <label htmlFor="invite-expires" className={f.label}>
            Expires
          </label>
          <input
            id="invite-expires"
            className={f.input}
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
          <span className={f.hint}>At the end of that day. Leave empty to never expire.</span>
        </div>
      </div>
      <div>
        <button type="submit" className={main['button']} disabled={pending}>
          <Plus size={16} />
          {pending ? 'Creating…' : 'Create code'}
        </button>
      </div>
    </form>
  );
}

function CopyLinkButton(props: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/register?code=${encodeURIComponent(props.code)}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`${main['button']} ${main['button-secondary']} ${main['button-small']}`}
    >
      {copied ? <Check size={14} /> : <LinkIcon size={14} />}
      {copied ? 'Link copied' : 'Copy sign-up link'}
    </button>
  );
}

function InviteRow(props: { invite: InviteCode }) {
  const router = useRouter();
  const { invite } = props;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const setDisabled = async (disabled: boolean) => {
    setError('');
    setPending(true);
    try {
      await api(`/api/admin/invites/${invite.id}`, { body: { disabled } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change it.');
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={s.invite}>
      <div className={s.inviteHeader}>
        <code className={s.code}>{invite.code}</code>
        <span className={`${s.status} ${invite.status === 'active' ? s.active : ''}`}>{STATUS_LABELS[invite.status]}</span>
      </div>
      {invite.note && <div>{invite.note}</div>}
      <div className={s.meta} suppressHydrationWarning>
        <span>
          {invite.uses} / {invite.maxUses ?? 'no limit'} used
        </span>
        <span>{invite.expiresAt ? `Expires ${formatDate(invite.expiresAt)}` : 'Never expires'}</span>
        <span>
          Made {formatDate(invite.createdAt)}
          {invite.createdBy && ` by ${invite.createdBy}`}
        </span>
      </div>
      {invite.usedBy.length > 0 && (
        <div className={s.meta}>
          <span>
            Signed up:{' '}
            {invite.usedBy.map((username, i) => (
              <span key={username}>
                {i > 0 && ', '}
                <Link href={`/me/${username}`}>{username}</Link>
              </span>
            ))}
          </span>
        </div>
      )}
      <div className={s.actions}>
        {invite.status === 'active' && <CopyLinkButton code={invite.code} />}
        {invite.disabledAt ? (
          <button
            type="button"
            className={`${main['button']} ${main['button-secondary']} ${main['button-small']}`}
            disabled={pending}
            onClick={() => setDisabled(false)}
          >
            Turn back on
          </button>
        ) : (
          <button
            type="button"
            className={`${main['button']} ${main['button-danger']} ${main['button-small']}`}
            disabled={pending}
            onClick={() => setDisabled(true)}
          >
            Disable
          </button>
        )}
        {error && <span className={s.error}>{error}</span>}
      </div>
    </li>
  );
}

export default function InviteCodes(props: { invites: InviteCode[] }) {
  return (
    <div className={s.page}>
      <section className={s.section}>
        <h2 className={s.sectionTitle}>New code</h2>
        <NewInviteForm />
      </section>
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Codes</h2>
        {props.invites.length === 0 ? (
          <p className={s.empty}>No invite codes yet. Make one above to start sending sign-up links.</p>
        ) : (
          <ul className={s.list}>
            {props.invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
