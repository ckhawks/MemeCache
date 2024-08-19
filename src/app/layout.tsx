import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.scss';

import 'bootstrap/dist/css/bootstrap.min.css';
import { LightThemeProvider } from '@/contexts/LightThemeContext';
import { getInitialLightTheme } from '@/contexts/getInitialLightTheme';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemeCache',
  description: 'Meme sharing and storage',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme = getInitialLightTheme();

  return (
    <html lang="en" data-theme={initialTheme}>
      <body className={inter.className}>
        <LightThemeProvider initialTheme={initialTheme}>
          {children}
        </LightThemeProvider>
      </body>
    </html>
  );
}
