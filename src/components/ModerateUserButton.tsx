'use client';

import { useState } from 'react';
import { Shield } from 'react-feather';
import { Modal } from 'react-bootstrap';
import main from '../app/main.module.scss';
import m from './ModerateUser.module.scss';
import TrustOverride from './TrustOverride';
import AdminRename from './AdminRename';
import AdminDeleteUser from './AdminDeleteUser';

// Admins only: one Moderate button that opens everything an admin can do to an account, on
// their profile and in the admin users table. The Bootstrap modal, as the report and takedown
// forms use, traps focus and closes on Escape and a click outside. On phones it is a sheet
// along the bottom of the screen. Delete is last and set apart.
export default function ModerateUserButton(props: {
  userId: string;
  username: string;
  trust: { override: 'trusted' | 'held' | null; held: boolean };
  // In the admin users table: renaming or deleting refreshes the table instead of going to
  // the profile.
  stayOnPage?: boolean;
}) {
  const [show, setShow] = useState(false);
  const close = () => setShow(false);

  const trustNow = props.trust.held
    ? props.trust.override === 'held'
      ? 'Held for review now, because an admin set it.'
      : 'Held for review now, by their record.'
    : props.trust.override === 'trusted'
      ? 'Their contributions always count, because an admin set it.'
      : 'Their contributions count now.';

  return (
    <>
      <button
        type="button"
        onClick={() => setShow(true)}
        className={`${main.button} ${main['button-secondary']} ${main['button-small']}`}
        aria-haspopup="dialog"
        aria-label={`Moderate ${props.username}`}
      >
        <Shield size={14} /> Moderate
      </button>
      <Modal show={show} onHide={close} centered dialogClassName={m.dialog}>
        <Modal.Header closeButton>
          <Modal.Title>Moderate {props.username}</Modal.Title>
        </Modal.Header>
        <Modal.Body className={m.body}>
          <section className={m.group} aria-labelledby={`moderate-trust-${props.userId}`}>
            <h3 id={`moderate-trust-${props.userId}`} className={m.groupTitle}>
              Trust
            </h3>
            <p className={m.groupHint}>
              {trustNow} A held member&apos;s new tags and transcriptions wait for someone to confirm them, and their votes and reviews do not count.
            </p>
            <TrustOverride userId={props.userId} override={props.trust.override} />
          </section>
          <section className={m.group} aria-labelledby={`moderate-name-${props.userId}`}>
            <h3 id={`moderate-name-${props.userId}`} className={m.groupTitle}>
              Name
            </h3>
            <p className={m.groupHint}>
              For an offensive or impersonating name. Their old name redirects to the new one and nobody else can take it for a while.
            </p>
            <AdminRename userId={props.userId} username={props.username} stayOnPage={props.stayOnPage} onDone={close} />
          </section>
          <section className={`${m.group} ${m.danger}`} aria-labelledby={`moderate-delete-${props.userId}`}>
            <h3 id={`moderate-delete-${props.userId}`} className={m.groupTitle}>
              Delete account
            </h3>
            <p className={m.groupHint}>
              Anonymises the account, as if they deleted it themselves. Their uploads and other contributions stay, credited to &quot;deleted user&quot;. This cannot be undone.
            </p>
            <AdminDeleteUser userId={props.userId} username={props.username} stayOnPage={props.stayOnPage} onDone={close} />
          </section>
        </Modal.Body>
      </Modal>
    </>
  );
}
