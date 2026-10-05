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
import { getWarningDisplay } from '@/db/queries/warnings';

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
  const initialTheme = await getInitialLightTheme();
  // How content warnings are shown. Visitors always get the blur.
  const user = await getUserFromAccessToken();
  const warningDisplay = user ? await getWarningDisplay(user.id) : 'blur';

  return (
    <html lang="en" data-theme={initialTheme} data-bs-theme={initialTheme}>
      <body className={inter.className}>
        <LightThemeProvider initialTheme={initialTheme}>
          <WarningDisplayProvider display={warningDisplay}>
            {children}
          </WarningDisplayProvider>
          <ServiceWorkerRegister />
        </LightThemeProvider>
      </body>
    </html>
  );
}
