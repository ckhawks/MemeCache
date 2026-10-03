'use client';

import { login } from '@/auth/actions';
import { useActionState } from 'react';

import styles from '../main.module.scss';
import { Alert, Form } from 'react-bootstrap';
import Link from 'next/link';
import { ArrowRight } from 'react-feather';

const initialState = {
  message: '',
};

export default function LoginComponent() {
  const [state, loginAction] = useActionState(login, initialState);

  return (
    <form action={loginAction}>
      {state?.message && (
        <div aria-live="polite">
          <Alert variant="danger" style={{ fontSize: '0.9rem' }}>
            {state?.message}
          </Alert>
        </div>
      )}
      <Form.Group className="mb-3" controlId="login-email">
        <Form.Label>Email address</Form.Label>
        <Form.Control type="email" name="email" autoComplete="email" />
      </Form.Group>
      <Form.Group className="mb-3" controlId="login-password">
        <Form.Label>Password</Form.Label>
        <Form.Control type="password" name="password" autoComplete="current-password" />
      </Form.Group>
      <br />
      <div className={styles['login-buttons']}>
        <button type="submit" className={styles['button']}>
          Log in{' '}
          <ArrowRight size={18} />
        </button>
        <Link
          href="/register"
          className={`${styles['button']} ${styles['button-secondary']}`}
        >
          Register
        </Link>
      </div>
    </form>
  );
}
