import { redirect } from 'next/navigation';
import { getUserFromAccessToken } from '@/auth/lib';
import AuthLayout from '@/components/AuthLayout';
import LoginComponent from './LoginComponent';
import { safeNext } from '@/util/safeNext';

export const metadata = {
  title: 'Log in · MemeCache',
};

// ?next= is where to land afterwards, set by links to pages that need an account.
export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await props.searchParams).next);
  if (await getUserFromAccessToken()) {
    redirect(next);
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your MemeCache.">
      <LoginComponent next={next} />
    </AuthLayout>
  );
}
