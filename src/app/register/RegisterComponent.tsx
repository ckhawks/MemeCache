'use client';

import { register } from '@/auth/actions';
import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'react-feather';
import styles from '../main.module.scss';
import f from '@/components/AuthForm.module.scss';

const initialState = {
  message: '',
};

export default function RegisterComponent(props: { code: string }) {
  const [state, registerAction, pending] = useActionState(register, initialState);

  return (
    <form action={registerAction} className={f.form}>
      {state?.message && (
        <div className={f.error} aria-live="polite">
          {state.message}
        </div>
      )}
      <div className={f.field}>
        <label htmlFor="register-username" className={f.label}>
          Username
        </label>
        <input
          id="register-username"
          className={f.input}
          type="text"
          name="username"
          autoComplete="username"
          required
        />
      </div>
      <div className={f.field}>
        <label htmlFor="register-email" className={f.label}>
          Email
        </label>
        <input id="register-email" className={f.input} type="email" name="email" autoComplete="email" required />
      </div>
      <div className={f.field}>
        <label htmlFor="register-password" className={f.label}>
          Password
        </label>
        <input
          id="register-password"
          className={f.input}
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className={f.hint}>At least 8 characters.</span>
      </div>
      <div className={f.field}>
        <label htmlFor="register-access-code" className={f.label}>
          Access code
        </label>
        <input
          id="register-access-code"
          className={f.input}
          type="text"
          name="access_code"
          autoComplete="off"
          defaultValue={props.code}
          required
        />
        <span className={f.hint}>MemeCache is invite-only. Ask a member or an admin for a code.</span>
      </div>
      <button type="submit" className={`${styles['button']} ${f.submit}`} disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'} {!pending && <ArrowRight size={16} />}
      </button>
      <p className={f.switch}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
