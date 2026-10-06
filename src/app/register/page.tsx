import { redirect } from 'next/navigation';
import { getUserFromAccessToken } from '@/auth/lib';
import AuthLayout from '@/components/AuthLayout';
import RegisterComponent from './RegisterComponent';

export const metadata = {
  title: 'Register',
};

export default async function RegisterPage(props: { searchParams: Promise<{ code?: string | string[] }> }) {
  if (await getUserFromAccessToken()) {
    redirect('/');
  }
  // Invite links from /admin/invites carry the code: /register?code=XXXX.
  const { code } = await props.searchParams;

  return (
    <AuthLayout title="Join MemeCache" subtitle="Save, find and send your group's memes.">
      <RegisterComponent code={typeof code === 'string' ? code.slice(0, 64) : ''} />
    </AuthLayout>
  );
}
