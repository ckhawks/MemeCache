'use client';

import { login } from '@/auth/actions';
import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'react-feather';
import styles from '../main.module.scss';
import f from '@/components/AuthForm.module.scss';

const initialState = {
  message: '',
};

export default function LoginComponent(props: { next: string }) {
  const [state, loginAction, pending] = useActionState(login, initialState);

  return (
    <form action={loginAction} className={f.form}>
      <input type="hidden" name="next" value={props.next} />
      {state?.message && (
        <div className={f.error} aria-live="polite">
          {state.message}
        </div>
      )}
      <div className={f.field}>
        <label htmlFor="login-email" className={f.label}>
          Email
        </label>
        <input id="login-email" className={f.input} type="email" name="email" autoComplete="email" required />
      </div>
      <div className={f.field}>
        <label htmlFor="login-password" className={f.label}>
          Password
        </label>
        <input
          id="login-password"
          className={f.input}
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>
      <button type="submit" className={`${styles['button']} ${f.submit}`} disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'} {!pending && <ArrowRight size={16} />}
      </button>
      <p className={f.switch}>
        No account yet? <Link href="/register">Register</Link>
      </p>
    </form>
  );
}
