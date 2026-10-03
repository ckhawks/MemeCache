import { redirect } from 'next/navigation';
import { getUserFromAccessToken } from '@/auth/lib';
import AuthLayout from '@/components/AuthLayout';
import LoginComponent from './LoginComponent';

export const metadata = {
  title: 'Log in · MemeCache',
};

export default async function LoginPage() {
  if (await getUserFromAccessToken()) {
    redirect('/');
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your MemeCache.">
      <LoginComponent />
    </AuthLayout>
  );
}
