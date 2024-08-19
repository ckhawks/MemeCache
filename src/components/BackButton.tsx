import { ArrowLeft } from 'react-feather';
import styles from './BackButton.module.scss';

import Link from 'next/link';

const BackButton = (props: { to: string; text: string }) => {
  return (
    <Link href={props.to} className={styles.BackButton}>
      <ArrowLeft size={'14'} />
      {props.text}
    </Link>
  );
};
export default BackButton;
