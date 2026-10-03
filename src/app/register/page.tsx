import { redirect } from 'next/navigation';
import { getUserFromAccessToken } from '@/auth/lib';
import AuthLayout from '@/components/AuthLayout';
import RegisterComponent from './RegisterComponent';

export const metadata = {
  title: 'Register · MemeCache',
};

export default async function RegisterPage() {
  if (await getUserFromAccessToken()) {
    redirect('/');
  }

  return (
    <AuthLayout title="Join MemeCache" subtitle="Save, find and send your group's memes.">
      <RegisterComponent />
    </AuthLayout>
  );
}
