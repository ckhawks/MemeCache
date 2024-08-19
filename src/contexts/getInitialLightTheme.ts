import { cookies } from 'next/headers';

export function getInitialLightTheme(): string {
  const theme = cookies().get('theme')?.value;
  return theme || 'light'; // Default to light if no cookie is set
}
