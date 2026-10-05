import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
// Bootstrap first and our globals after: at equal specificity the later sheet wins, and
// the other way round Bootstrap overrode our link colors, buttons and heading sizes.
import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.scss';
import { LightThemeProvider } from '@/contexts/LightThemeContext';
import { getInitialLightTheme } from '@/contexts/getInitialLightTheme';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { WarningDisplayProvider } from '@/contexts/WarningDisplayContext';
import { getUserFromAccessToken } from '@/auth/lib';
import { getSettings } from '@/db/queries/settings';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemeCache',
  description: 'Meme sharing and storage',
};

export const viewport: Viewport = {
  // Lets the page draw under the iPhone home indicator; the tab bar pads for it.
  viewportFit: 'cover',
  themeColor: [
    {
      media: '(prefers-color-scheme: light)',
      color: '#ffffff',
    },
    {
      media: '(prefers-color-scheme: dark)',
      color: '#121212',
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The member's settings (migration 018), or the defaults for a visitor: content warnings
  // blurred, and the theme left to this browser.
  const user = await getUserFromAccessToken();
  const settings = await getSettings(user?.id);
  const warningDisplay = settings.warning_display;
  // A theme saved on the account beats this browser's cookie, so it follows them around.
  const initialTheme = settings.theme ?? (await getInitialLightTheme());

  return (
    <html lang="en" data-theme={initialTheme} data-bs-theme={initialTheme}>
      <body className={inter.className}>
        <LightThemeProvider initialTheme={initialTheme} accountTheme={settings.theme} loggedIn={!!user}>
          <WarningDisplayProvider display={warningDisplay}>
            {children}
          </WarningDisplayProvider>
          <ServiceWorkerRegister />
        </LightThemeProvider>
      </body>
    </html>
  );
}
