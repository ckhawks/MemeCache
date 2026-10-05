import styles from './Tooltip.module.scss';

// A styled hover label for icon buttons, in place of the browser's own title tooltip.
// Pure CSS: shown on hover (on devices that can hover) and on keyboard focus.
// `align="end"` anchors it to the right edge, for icons at the right edge of a card.
// `below` puts it under the element, for the nav, where above would be off the page.
export default function Tooltip(props: {
  label: string;
  align?: 'center' | 'end';
  below?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${styles['tooltip']} ${props.align === 'end' ? styles['end'] : ''} ${
        props.below ? styles['below'] : ''
      }`}
      data-tooltip={props.label}
    >
      {props.children}
    </span>
  );
}
