import styles from './Tooltip.module.scss';

// A styled hover label for icon buttons, in place of the browser's own title tooltip.
// Pure CSS: shown on hover (on devices that can hover) and on keyboard focus.
// `align="end"` anchors it to the right edge, for icons at the right edge of a card.
export default function Tooltip(props: {
  label: string;
  align?: 'center' | 'end';
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${styles['tooltip']} ${props.align === 'end' ? styles['end'] : ''}`}
      data-tooltip={props.label}
    >
      {props.children}
    </span>
  );
}
