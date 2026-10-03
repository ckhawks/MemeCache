'use client';

import { register } from '@/auth/actions';
import { useActionState } from 'react';

import styles from '../main.module.scss';
import { Alert, Form } from 'react-bootstrap';
import Link from 'next/link';
import { ArrowRight } from 'react-feather';

const initialState = {
  message: '',
};

export default function RegisterComponent() {
  const [state, registerAction] = useActionState(register, initialState);

  return (
    <form action={registerAction}>
      {state?.message && (
        <div aria-live="polite">
          <Alert variant="danger" style={{ fontSize: '0.9rem' }}>
            {state?.message}
          </Alert>
        </div>
      )}
      <Form.Group className="mb-3" controlId="register-username">
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" name="username" autoComplete="username" />
      </Form.Group>
      <Form.Group className="mb-3" controlId="register-email">
        <Form.Label>Email address</Form.Label>
        <Form.Control type="email" name="email" autoComplete="email" />
      </Form.Group>
      <Form.Group className="mb-3" controlId="register-password">
        <Form.Label>Password</Form.Label>
        <Form.Control type="password" name="password" autoComplete="new-password" />
      </Form.Group>
      <Form.Group className="mb-3" controlId="register-access_code">
        <Form.Label>Access Code</Form.Label>
        <Form.Control type="text" name="access_code" autoComplete="off" />
      </Form.Group>
      <br />
      <div className={styles['login-buttons']}>
        <button type="submit" className={styles['button']}>
          {/* <FontAwesomeIcon icon={faPlus} />  */} Register{' '}
          <ArrowRight size={18} />
        </button>
        <Link
          href="/login"
          className={`${styles['button']} ${styles['button-secondary']}`}
        >
          Log in
        </Link>
      </div>
    </form>
  );
}
