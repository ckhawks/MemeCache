import { cookies } from 'next/headers';

export async function getInitialLightTheme(): Promise<string> {
  const theme = (await cookies()).get('theme')?.value;
  return theme || 'light'; // Default to light if no cookie is set
}
