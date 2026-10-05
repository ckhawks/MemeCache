import styles from './SearchSnippet.module.scss';

// The matching text under a search result. The query marks matched words with \u0001 and
// \u0002 (search.ts) rather than HTML, so the text is never parsed as markup.
export default function SearchSnippet(props: { text: string }) {
  const parts = props.text.split(/(\u0001[^\u0002]*\u0002)/);
  return (
    <p className={styles['snippet']}>
      {parts.map((part, i) =>
        part.startsWith('\u0001') ? (
          <mark key={i} className={styles['match']}>
            {part.slice(1, -1)}
          </mark>
        ) : (
          part
        )
      )}
    </p>
  );
}
