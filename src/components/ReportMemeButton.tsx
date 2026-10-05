'use client';

import { useState } from 'react';
import { Flag } from 'react-feather';
import { Modal } from 'react-bootstrap';
import localStyles from './LikeButton.module.scss';
import styles from '../app/main.module.scss';
import form from './AuthForm.module.scss';
import { api } from '@/util/api';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@/constants/reports';

// The meme page's Report pill and its form: a reason and an optional note, sent to the
// moderators' review page. Opening it again while the member's report is still open shows
// that report, and sending replaces it.
export default function ReportMemeButton(props: { memeId: string }) {
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [hasOpenReport, setHasOpenReport] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleShow = async () => {
    setShow(true);
    setSent(false);
    setError('');
    try {
      const { report } = await api<{ report: { reason: ReportReason; details: string | null } | null }>(
        `/api/meme/${props.memeId}/report`
      );
      if (report) {
        setReason(report.reason);
        setDetails(report.details ?? '');
        setHasOpenReport(true);
      }
    } catch {
      // Only fills in an earlier report. The form works without it.
    }
  };

  const handleClose = () => {
    setShow(false);
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError('Pick a reason.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      await api(`/api/meme/${props.memeId}/report`, {
        body: {
          reason,
          details: details.trim() || undefined,
        },
      });
      setSent(true);
      setHasOpenReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the report.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <button type="button" onClick={handleShow} className={`${localStyles['pill']} ${localStyles['pillDanger']}`}>
        <Flag size={16} />
        Report
      </button>
      <Modal show={show} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontWeight: 700 }}>Report meme</Modal.Title>
        </Modal.Header>
        {sent ? (
          <>
            <Modal.Body>Thanks. A moderator will take a look.</Modal.Body>
            <Modal.Footer>
              <button type="button" onClick={handleClose} className={`${styles['button']} ${styles['button-secondary']}`}>
                Close
              </button>
            </Modal.Footer>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Modal.Body>
              <div className={form.form}>
                {hasOpenReport && (
                  <div className={form.hint}>You already reported this meme. Sending again replaces your report.</div>
                )}
                <div className={form.field}>
                  <label htmlFor="report-reason" className={form.label}>
                    Reason
                  </label>
                  <select
                    id="report-reason"
                    className={form.select}
                    value={reason}
                    onChange={(e) => setReason(e.target.value as ReportReason)}
                    required
                  >
                    <option value="" disabled>
                      Pick a reason
                    </option>
                    {REPORT_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={form.field}>
                  <label htmlFor="report-details" className={form.label}>
                    Details (optional)
                  </label>
                  <textarea
                    id="report-details"
                    className={form.input}
                    rows={3}
                    maxLength={REPORT_DETAILS_MAX}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Anything that helps, like a link to the original"
                  />
                  <div className={form.hint}>
                    {details.length}/{REPORT_DETAILS_MAX}
                  </div>
                </div>
                {error && <div className={form.error}>{error}</div>}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <button type="button" onClick={handleClose} className={`${styles['button']} ${styles['button-secondary']}`}>
                Cancel
              </button>
              <button type="submit" className={`${styles['button']} ${styles['button-danger']}`} disabled={processing}>
                Send report
              </button>
            </Modal.Footer>
          </form>
        )}
      </Modal>
    </>
  );
}
