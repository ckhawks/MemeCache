import styles from './MemeTranscriptionEditor.module.scss';

// The house rules for transcribing, shown wherever someone writes or reviews one. Reviewers
// judge against these, so keep them short and keep them here.
export default function TranscriptionGuidelines() {
  return (
    <details className={styles.guidelines}>
      <summary>Guidelines</summary>
      <ul>
        <li>All the text, top to bottom, left to right.</li>
        <li>Exactly as written: spelling, capitals, emoji. Do not fix typos.</li>
        <li>One line per caption, panel or speech bubble.</li>
        <li>Keep names and handles in screenshots; leave out timestamps and buttons.</li>
        <li>No text on the meme? Leave it empty.</li>
      </ul>
    </details>
  );
}
