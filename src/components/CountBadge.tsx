import styles from './CountBadge.module.scss';

// A small count bubble, like the unread number on the notification bell. Renders nothing at
// zero. Past `max` it reads "99+", so it never grows wider than three digits.
export default function CountBadge(props: { count: number; max?: number; className?: string }) {
  const max = props.max ?? 99;
  if (props.count <= 0) {
    return null;
  }
  return (
    <span className={`${styles['badge']} ${props.className ?? ''}`}>
      {props.count > max ? `${max}+` : props.count}
    </span>
  );
}
